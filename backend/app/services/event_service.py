"""Hand corrections to AI-extracted events."""

from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.user import User
from app.repositories.events import EventRepository


@dataclass
class EventService:
    session: Session
    events: EventRepository

    def correct(self, user: User, event_id: int, changes: dict[str, Any]) -> Event:
        """Apply the user's fixes and mark the event as corrected, so re-extracting the
        update later keeps them (see event_extraction.reextract_events)."""
        event = self.events.get_owned(event_id, user.id)
        for field, value in changes.items():
            setattr(event, field, value)
        if changes:
            event.is_corrected = True
        self.session.commit()
        self.session.refresh(event)
        return event

    def delete(self, user: User, event_id: int) -> None:
        """Remove an irrelevant event (the source update stays intact)."""
        self.events.delete(self.events.get_owned(event_id, user.id))
        self.session.commit()
