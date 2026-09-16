from typing import Any

from sqlalchemy.orm import Session

from app.ai.providers.base import AIProvider
from app.models.enums import Category, Sentiment
from app.models.event import Event
from app.models.update import Update

_DETAIL_KEYS = ("amount", "currency", "duration_minutes")


def extract_and_store_events(db: Session, update: Update, provider: AIProvider) -> list[Event]:
    """Run AI extraction on one update and persist the resulting Event rows.

    Malformed individual events from the provider are skipped rather than
    failing the whole update — the raw update itself is never at risk of being
    lost because of a bad or missing AI response (see the calling endpoint).
    """
    raw_events: list[dict[str, Any]] = provider.extract_events(update.content)

    events: list[Event] = []
    for raw in raw_events:
        try:
            category = Category(raw["category"])
        except (KeyError, ValueError):
            continue

        sentiment_raw = raw.get("sentiment")
        sentiment = Sentiment(sentiment_raw) if sentiment_raw in Sentiment._value2member_map_ else None

        event = Event(
            update_id=update.id,
            user_id=update.user_id,
            category=category,
            type=str(raw.get("type", "general_activity"))[:64],
            description=str(raw.get("description", update.content))[:2000],
            sentiment=sentiment,
            confidence=raw.get("confidence"),
            details={k: raw[k] for k in _DETAIL_KEYS if k in raw},
        )
        db.add(event)
        events.append(event)

    db.commit()
    for event in events:
        db.refresh(event)
    return events
