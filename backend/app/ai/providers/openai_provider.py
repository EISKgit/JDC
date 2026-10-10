import json
from typing import Any

import httpx

from app.ai.providers.base import AIProvider, AIProviderError
from app.models.enums import Category

_CATEGORY_VALUES = ", ".join(c.value for c in Category)

_EXTRACTION_SYSTEM_PROMPT = f"""You extract structured life events from a user's diary-style update.
Valid categories: {_CATEGORY_VALUES}.
Each description is one standalone sentence about a single event, rewritten with correct spelling, grammar and \
capitalisation, keeping the user's meaning, first-person voice and details (numbers, names). Keep the user's own \
terms and abbreviations (e.g. DSA, C++) as written instead of expanding them.
Respond ONLY with JSON: {{"events": [{{"category": str, "type": str, "description": str, \
"sentiment": "positive"|"neutral"|"negative", "confidence": float between 0 and 1, \
"amount": float (optional), "currency": ISO 4217 code like INR or USD (optional), "duration_minutes": int (optional)}}]}}"""

OPENAI_BASE_URL = "https://api.openai.com/v1"
GROQ_BASE_URL = "https://api.groq.com/openai/v1"


class OpenAIProvider(AIProvider):
    """Real LLM provider, talking to any OpenAI-compatible Chat Completions API
    (OpenAI itself, Groq, ...) directly over HTTP — no vendor SDK dependency.
    """

    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: str = OPENAI_BASE_URL,
        key_name: str = "OPENAI_API_KEY",
        reasoning_effort: str | None = None,
    ) -> None:
        if not api_key:
            raise AIProviderError(f"{key_name} is not set")
        self._api_key = api_key
        self._model = model
        self._base_url = base_url
        self._reasoning_effort = reasoning_effort

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
        if self._reasoning_effort:
            body["reasoning_effort"] = self._reasoning_effort

        try:
            response = httpx.post(
                f"{self._base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self._api_key}"},
                json=body,
                timeout=30.0,
            )
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"]
        except httpx.HTTPError as exc:
            raise AIProviderError(f"AI request failed: {exc}") from exc
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise AIProviderError(f"AI returned an unexpected response: {exc}") from exc

    def extract_events(self, update_text: str) -> list[dict[str, Any]]:
        raw = self._chat(_EXTRACTION_SYSTEM_PROMPT, update_text, json_mode=True)
        try:
            parsed = json.loads(raw)
        except (json.JSONDecodeError, TypeError) as exc:
            raise AIProviderError(f"AI returned invalid JSON: {exc}") from exc
        events = parsed.get("events") if isinstance(parsed, dict) else None
        if not isinstance(events, list):
            raise AIProviderError("AI response has no events list")
        return [e for e in events if isinstance(e, dict)]

    def generate_narrative(self, *, kind: str, context: dict[str, Any]) -> str:
        system_prompt = (
            "You interpret already-computed, deterministic life-tracking metrics for a user, speaking to "
            "them directly as \"you\". Never invent numbers not present in the given data. Be concise "
            "(1-3 sentences), concrete, and avoid overstating certainty. Use plain words: never repeat "
            "internal field names or values such as insufficient_evidence; say there isn't enough data yet."
        )
        user_prompt = f"kind: {kind}\ndata: {json.dumps(context)}"
        text = self._chat(system_prompt, user_prompt, json_mode=False)
        if not text or not text.strip():
            raise AIProviderError("AI returned an empty narrative")
        return text.strip()
