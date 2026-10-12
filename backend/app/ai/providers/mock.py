import re
from functools import lru_cache
from typing import Any

from app.ai.providers.base import AIProvider
from app.ai.text_polish import polish_sentence
from app.models.enums import Category

# category -> (keywords to match in a sentence, event "type" label to assign).
# Keywords match whole words; a trailing "*" also matches longer forms
# ("walk*" -> walk, walked, walking). Plain substring matching used to misfire:
# "run " missed "run," and "read" matched "ready".
_CATEGORY_RULES: list[tuple[Category, list[str], str]] = [
    (Category.health, ["gym", "workout*", "exercis*", "ran", "run", "runs", "running", "jog*", "walk*", "yoga",
                       "sleep*", "slept", "doctor", "sick"], "exercise"),
    (Category.career, ["work", "worked", "working", "project*", "meeting*", "coding", "code", "job*", "interview*",
                       "deadline*", "client*", "presentation*"], "work_activity"),
    (Category.finance, ["spent", "spend*", "bought", "buy*", "expense*", "paid", "salary", "saved", "budget*"], "expense"),
    (Category.relationships, ["friend*", "family", "argument*", "fight*", "dinner with", "partner*", "mom", "dad",
                              "relationship*"], "social_interaction"),
    (Category.learning, ["learn*", "study", "studied", "studying", "course*", "read", "reading", "book*", "tutorial*",
                         "class", "classes"], "learning_activity"),
    (Category.personal_growth, ["meditat*", "journal*", "reflect*", "therapy", "mindful*"], "reflection"),
    (Category.lifestyle, ["movie*", "travel*", "trip*", "hobby", "hobbies", "cook*", "cleaned", "shopping", "party"],
     "general_activity"),
]

# Public view of the keyword lists (category value -> keywords), also used by
# journal search to connect a word like "workout" to the Health area.
CATEGORY_KEYWORDS: dict[str, list[str]] = {cat.value: keywords for cat, keywords, _ in _CATEGORY_RULES}

# "Spent 2 hours studying" is about time, not money — these verbs only count as
# finance when the sentence isn't describing a duration.
_AMBIGUOUS_MONEY_WORDS = {"spent", "spend*", "paid", "saved", "bought", "buy*"}

_NEGATIVE_WORDS = ["skipped", "missed", "tired", "stressed", "argument*", "fight*", "bad", "sad", "anxious",
                   "exhausted", "sick"]
_POSITIVE_WORDS = ["great", "good", "enjoy*", "happy", "proud", "finished", "accomplished", "productive", "fun",
                   "relaxing"]

_AMOUNT_RE = re.compile(r"[₹$]\s?(\d+(?:\.\d+)?)")
_DURATION_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)", re.IGNORECASE)


@lru_cache
def _keyword_pattern(keyword: str) -> re.Pattern[str]:
    if keyword.endswith("*"):
        return re.compile(rf"\b{re.escape(keyword[:-1])}\w*")
    return re.compile(rf"\b{re.escape(keyword)}\b")


def _matches(lower: str, keywords: list[str]) -> bool:
    return any(_keyword_pattern(k).search(lower) for k in keywords)


def _matches_category(category: Category, keywords: list[str], lower: str) -> bool:
    if category == Category.finance:
        if _AMOUNT_RE.search(lower):
            return True
        if _DURATION_RE.search(lower):
            keywords = [k for k in keywords if k not in _AMBIGUOUS_MONEY_WORDS]
    return _matches(lower, keywords)


def _split_sentences(text: str) -> list[str]:
    parts = re.split(r"[.!?\n]+", text)
    return [p.strip() for p in parts if p.strip()]


def _sentiment(sentence: str) -> str:
    lower = sentence.lower()
    if _matches(lower, _NEGATIVE_WORDS):
        return "negative"
    if _matches(lower, _POSITIVE_WORDS):
        return "positive"
    return "neutral"


def _label(category: str) -> str:
    """Turn an enum value like "personal_growth" into "personal growth"."""
    return category.replace("_", " ")


def _trend_phrase(trend: str) -> str:
    if trend == "insufficient_evidence":
        return "doesn't have enough data to show a trend yet"
    return f"is trending {trend}"


def _duration_minutes(sentence: str) -> int | None:
    match = _DURATION_RE.search(sentence)
    if not match:
        return None
    value = float(match.group(1))
    unit = match.group(2).lower()
    return int(value * 60) if unit.startswith("h") else int(value)


class MockProvider(AIProvider):
    """Deterministic, rule-based stand-in for a real LLM.

    Needs no API key and produces stable output, so the whole app is runnable
    and demoable out of the box. Swap AI_PROVIDER=openai in .env for real
    model-generated extraction/narratives without touching any business logic.
    """

    def extract_events(self, update_text: str) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []
        for sentence in _split_sentences(update_text):
            lower = sentence.lower()
            category, event_type, confidence = None, "general_activity", 0.4
            for cat, keywords, type_label in _CATEGORY_RULES:
                if _matches_category(cat, keywords, lower):
                    category, event_type, confidence = cat, type_label, 0.9
                    break
            if category is None:
                category = Category.lifestyle

            event: dict[str, Any] = {
                "category": category.value,
                "type": event_type,
                # No LLM to rewrite it, so tidy typos/casing by rule; the update keeps the raw text.
                "description": polish_sentence(sentence),
                "sentiment": _sentiment(sentence),
                "confidence": confidence,
            }

            amount_match = _AMOUNT_RE.search(sentence)
            if amount_match:
                event["amount"] = float(amount_match.group(1))
                event["currency"] = "INR" if "₹" in sentence else "USD"

            duration = _duration_minutes(sentence)
            if duration is not None:
                event["duration_minutes"] = duration

            events.append(event)
        return events

    def generate_narrative(self, *, kind: str, context: dict[str, Any]) -> str:
        if kind == "life_profile":
            categories = ", ".join(context.get("focus_categories", [])) or "your life areas"
            return (
                f"Focused on {categories}. "
                f"Goals: {context.get('goals_text') or 'not specified yet'}. "
                f"Current challenges: {context.get('challenges') or 'none noted'}."
            )

        if kind == "forecast":
            category = _label(context.get("category", "this category"))
            direction = context.get("direction", "stable")
            horizon = context.get("horizon_days", 7)
            if direction == "insufficient_evidence":
                return f"Not enough data yet to forecast {category} — keep logging updates."
            pct = context.get("pct_change")
            pct_text = f" ({pct:+.0f}% vs. the previous period)" if pct is not None else ""
            return (
                f"{category.capitalize()} activity is {direction}{pct_text}. "
                f"If this pattern continues, it is likely to remain {direction} "
                f"over the next {horizon} days ({context.get('confidence', 'medium')} confidence)."
            )

        if kind == "warning":
            return (
                f"{_label(context.get('category', 'This area')).capitalize()} signal: "
                f"{context.get('negative_count', 0)} negative updates in the last "
                f"{context.get('period_days', 14)} days. Consider reviewing recent patterns here."
            )

        if kind == "recommendation":
            return (
                f"Your {_label(context.get('category', 'lowest'))} score is currently "
                f"{context.get('score', '?')}/100 and {_trend_phrase(context.get('trend', 'stable'))}. "
                "Consider a small, consistent action in this area this week."
            )

        total = context.get("total_events", 0)
        counts: dict[str, int] = context.get("category_counts", {})
        if not counts:
            return f"No activity recorded for this {context.get('period', 'period')} yet."

        top_category = max(counts, key=counts.get)
        parts = [
            f"{total} event(s) logged this {context.get('period', 'period')}, "
            f"mostly in {_label(top_category)} ({counts[top_category]})."
        ]
        deltas: dict[str, int] = context.get("category_deltas", {})
        for cat, delta in deltas.items():
            if delta > 0:
                parts.append(f"{_label(cat).capitalize()} activity increased by {delta} compared to the previous period.")
            elif delta < 0:
                parts.append(f"{_label(cat).capitalize()} activity decreased by {abs(delta)} compared to the previous period.")
        return " ".join(parts)
