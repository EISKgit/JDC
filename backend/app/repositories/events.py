from datetime import datetime

from app.models.event import Event
from app.repositories.base import OwnedRepository


class EventRepository(OwnedRepository[Event]):
    model = Event
    label = "Event"

    def in_range(self, user_id: int, start: datetime, end: datetime) -> list[Event]:
        """The user's events with start <= created_at < end, oldest first."""
        return (
            self.session.query(Event)
            .filter(Event.user_id == user_id, Event.created_at >= start, Event.created_at < end)
            .order_by(Event.created_at)
            .all()
        )
