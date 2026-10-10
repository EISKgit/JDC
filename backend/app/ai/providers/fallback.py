import json
import logging
from collections import OrderedDict
from typing import Any

from app.ai.providers.base import AIProvider, AIProviderError

logger = logging.getLogger(__name__)

_NARRATIVE_CACHE_SIZE = 512

# Narratives worth a model call. Forecast lines (7 per dashboard) and warnings
# are formulaic restatements of numbers, so the rule templates say the same
# thing instantly — a first dashboard load went from ~13s to ~2s on Groq.
_LLM_NARRATIVE_KINDS = {"daily_summary", "weekly_summary", "monthly_summary", "recommendation", "life_profile"}


class FallbackProvider(AIProvider):
    """Uses a real LLM, but never lets it break the app.

    - Any provider failure (network, rate limit, bad JSON) falls back to the
      deterministic rule-based provider instead of returning nothing.
    - Narratives are cached by their exact input: a dashboard load asks for ~9
      of them, and the numbers rarely change between loads, so repeat views
      cost no API calls (free-tier rate limits are tight).
    - Only the narratives that benefit from a model use it (see above).
    """

    def __init__(self, primary: AIProvider, fallback: AIProvider) -> None:
        self._primary = primary
        self._fallback = fallback
        self._narratives: OrderedDict[str, str] = OrderedDict()

    def extract_events(self, update_text: str) -> list[dict[str, Any]]:
        try:
            return self._primary.extract_events(update_text)
        except AIProviderError:
            logger.warning("AI extraction failed, using rule-based fallback", exc_info=True)
            return self._fallback.extract_events(update_text)

    def generate_narrative(self, *, kind: str, context: dict[str, Any]) -> str:
        if kind not in _LLM_NARRATIVE_KINDS:
            return self._fallback.generate_narrative(kind=kind, context=context)
        key = f"{kind}:{json.dumps(context, sort_keys=True, default=str)}"
        if key in self._narratives:
            self._narratives.move_to_end(key)
            return self._narratives[key]
        try:
            text = self._primary.generate_narrative(kind=kind, context=context)
        except AIProviderError:
            logger.warning("AI narrative failed, using rule-based fallback", exc_info=True)
            # Not cached, so the real model is tried again next time.
            return self._fallback.generate_narrative(kind=kind, context=context)
        self._narratives[key] = text
        if len(self._narratives) > _NARRATIVE_CACHE_SIZE:
            self._narratives.popitem(last=False)
        return text
