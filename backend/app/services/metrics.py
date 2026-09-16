from collections import Counter
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.enums import Category, Sentiment
from app.models.event import Event


def get_events_in_range(db: Session, user_id: int, start: datetime, end: datetime) -> list[Event]:
    return (
        db.query(Event)
        .filter(Event.user_id == user_id, Event.created_at >= start, Event.created_at < end)
        .order_by(Event.created_at)
        .all()
    )


def category_counts(events: list[Event]) -> dict[str, int]:
    return dict(Counter(e.category.value for e in events))


def events_by_category(events: list[Event]) -> dict[Category, list[Event]]:
    grouped: dict[Category, list[Event]] = {c: [] for c in Category}
    for event in events:
        grouped[event.category].append(event)
    return grouped


def compute_category_score(category_events: list[Event], period_days: int) -> int:
    """A deterministic 0-100 score from measurable signals only — no LLM involved.

    Base 50, then adjusted by:
      - activity: more logged events this period → higher (capped, so spamming
        updates can't dominate the score)
      - sentiment: net positive vs. negative events, capped both directions
      - consistency: how many distinct days had activity, relative to the
        period length
    """
    count = len(category_events)
    positive = sum(1 for e in category_events if e.sentiment == Sentiment.positive)
    negative = sum(1 for e in category_events if e.sentiment == Sentiment.negative)
    distinct_days = len({e.created_at.date() for e in category_events})

    activity_bonus = min(count * 5, 30)
    sentiment_bonus = max(-20, min(20, (positive - negative) * 4))
    consistency_bonus = round((distinct_days / period_days) * 20) if period_days > 0 else 0

    score = 50 + activity_bonus + sentiment_bonus + consistency_bonus
    return max(0, min(100, score))


def compute_overall_score(category_scores: dict[Category, int], focus_categories: list[str]) -> int:
    """A weighted aggregate, not a plain average — see README "Overall Life Score".

    Categories the user picked as a focus area during onboarding count 1.5x, so
    the number reflects what the user actually cares about rather than treating
    every category as equally important to them.
    """
    if not category_scores:
        return 0
    weights = {cat: (1.5 if cat.value in focus_categories else 1.0) for cat in category_scores}
    total_weight = sum(weights.values())
    weighted_sum = sum(score * weights[cat] for cat, score in category_scores.items())
    return round(weighted_sum / total_weight) if total_weight else 0
