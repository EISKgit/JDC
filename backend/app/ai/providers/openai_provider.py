import json
from typing import Any

import httpx

from app.ai.providers.base import AIProvider, AIProviderError
from app.models.enums import Category

_CATEGORY_VALUES = ", ".join(c.value for c in Category)

_EXTRACTION_SYSTEM_PROMPT = f"""You extract structured life events from a user's diary-style update.
Valid categories: {_CATEGORY_VALUES}.
Each description is one standalone sentence about a single event, rewritten with correct spelling, grammar and \
capitalisation, keeping the user's meaning, first-person voice and details (numbers, names).
Respond ONLY with JSON: {{"events": [{{"category": str, "type": str, "description": str, \
"sentiment": "positive"|"neutral"|"negative", "confidence": float between 0 and 1, \
"amount": float (optional), "currency": str (optional), "duration_minutes": int (optional)}}]}}"""


class OpenAIProvider(AIProvider):
    """Real LLM provider, talking to the OpenAI-compatible Chat Completions API
    directly over HTTP (no vendor SDK dependency, so switching providers later
    only means adding another small class like this one).
    """

    def __init__(self, api_key: str, model: str) -> None:
        if not api_key:
            raise AIProviderError("OPENAI_API_KEY is not set but AI_PROVIDER=openai")
        self._api_key = api_key
        self._model = model

    def _chat(self, system_prompt: str, user_prompt: str, *, json_mode: bool) -> str:
        body: dict[str, Any] = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}

        try:
            response = httpx.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {self._api_key}"},
                json=body,
                timeout=30.0,
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise AIProviderError(f"OpenAI request failed: {exc}") from exc

        return response.json()["choices"][0]["message"]["content"]

    def extract_events(self, update_text: str) -> list[dict[str, Any]]:
        raw = self._chat(_EXTRACTION_SYSTEM_PROMPT, update_text, json_mode=True)
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise AIProviderError(f"OpenAI returned invalid JSON: {exc}") from exc
        return parsed.get("events", [])

    def generate_narrative(self, *, kind: str, context: dict[str, Any]) -> str:
        system_prompt = (
            "You interpret already-computed, deterministic life-tracking metrics for a user. "
            "Never invent numbers not present in the given data. Be concise (2-4 sentences), "
            "concrete, and avoid overstating certainty."
        )
        user_prompt = f"kind: {kind}\ndata: {json.dumps(context)}"
        return self._chat(system_prompt, user_prompt, json_mode=False)
