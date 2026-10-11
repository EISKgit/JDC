from difflib import SequenceMatcher
from typing import Any

from sqlalchemy.orm import Session

from app.ai.providers.base import AIProvider
from app.models.enums import Category, Sentiment
from app.models.event import Event
from app.models.update import Update

_DETAIL_KEYS = ("amount", "currency", "duration_minutes")

# How alike an old and a new statement must read to count as "the same event"
# when an edited update is re-extracted (0..1, difflib ratio).
_SAME_EVENT_SIMILARITY = 0.6


def extract_and_store_events(db: Session, update: Update, provider: AIProvider) -> list[Event]:
    """Run AI extraction on one update and persist the resulting Event rows.

    Malformed individual events from the provider are skipped rather than
    failing the whole update — the raw update itself is never at risk of being
    lost because of a bad or missing AI response (see the calling endpoint).
    """
    events = _build_events(update, provider.extract_events(update.content))
    db.add_all(events)
    db.commit()
    for event in events:
        db.refresh(event)
    return events


def _build_events(update: Update, raw_events: list[dict[str, Any]]) -> list[Event]:
    events: list[Event] = []
    for raw in raw_events:
        try:
            category = Category(raw["category"])
        except (KeyError, ValueError):
            continue

        sentiment_raw = raw.get("sentiment")
        sentiment = Sentiment(sentiment_raw) if sentiment_raw in Sentiment._value2member_map_ else None
        description = str(raw.get("description") or "").strip()
        if not description:
            continue

        events.append(
            Event(
                update_id=update.id,
                user_id=update.user_id,
                category=category,
                type=str(raw.get("type", "general_activity"))[:64],
                description=description[:2000],
                sentiment=sentiment,
                confidence=raw.get("confidence"),
                details={k: raw[k] for k in _DETAIL_KEYS if k in raw},
                # Dated by when it happened, so re-extracting an edited update keeps its day.
                created_at=update.created_at,
            )
        )
    return events


def reextract_events(db: Session, update: Update, provider: AIProvider) -> list[Event]:
    """Replace an update's events with a fresh extraction of its current text.

    Statements always follow the new text, but a category/sentiment the user
    fixed by hand is carried over to the new event for the same sentence, so
    editing the paragraph doesn't undo their corrections.

    Extraction runs *before* anything is deleted: if it fails, the update keeps
    its previous events instead of being left with none.
    """
    raw_events = provider.extract_events(update.content)

    corrections = [
        (e.description, e.category, e.type, e.sentiment) for e in update.events if e.is_corrected
    ]
    update.events.clear()
    events = _build_events(update, raw_events)
    db.add_all(events)
    db.flush()

    unmatched = list(events)
    for old_description, category, event_type, sentiment in corrections:
        match = _most_similar(old_description, unmatched)
        if match is None:
            continue  # that sentence is gone from the update
        unmatched.remove(match)
        match.category, match.type, match.sentiment = category, event_type, sentiment
        match.is_corrected = True

    db.commit()
    db.refresh(update)
    return events


def _most_similar(description: str, candidates: list[Event]) -> Event | None:
    best, best_ratio = None, _SAME_EVENT_SIMILARITY
    for event in candidates:
        ratio = SequenceMatcher(None, description.lower(), event.description.lower()).ratio()
        if ratio >= best_ratio:
            best, best_ratio = event, ratio
    return best
