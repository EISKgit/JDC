from abc import ABC, abstractmethod
from typing import Any


class AIProviderError(Exception):
    """Raised when a real AI provider call fails (network error, bad response, ...)."""


class AIProvider(ABC):
    """Provider-agnostic interface for every AI operation this app needs.

    Business logic (extraction service, intelligence engine, ...) only ever
    talks to this interface — never to a specific vendor SDK. Swapping
    providers means writing a new class here, nothing else changes.
    """

    @abstractmethod
    def extract_events(self, update_text: str) -> list[dict[str, Any]]:
        """Turn one raw natural-language update into a list of structured events.

        Each returned dict should include at least: category, type,
        description, sentiment, confidence — and may include extra numeric
        fields like amount/currency/duration_minutes.
        """

    @abstractmethod
    def generate_narrative(self, *, kind: str, context: dict[str, Any]) -> str:
        """Turn already-computed, deterministic metrics into a short, plain-language
        interpretation. `kind` identifies what's being explained (e.g.
        "daily_summary", "weekly_summary", "life_profile"); `context` is the
        deterministic data (counts, trends, scores) to interpret — never raw
        user text the model would have to compute over itself.
        """
