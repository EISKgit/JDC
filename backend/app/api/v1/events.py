from fastapi import APIRouter, Depends, status

from app.api.deps import get_current_user, get_event_service
from app.models.event import Event
from app.models.user import User
from app.schemas.event import EventCorrection, EventOut
from app.services.event_service import EventService

router = APIRouter(prefix="/events", tags=["events"])


@router.patch("/{event_id}", response_model=EventOut)
def correct_event(
    event_id: int,
    payload: EventCorrection,
    current_user: User = Depends(get_current_user),
    events: EventService = Depends(get_event_service),
) -> Event:
    return events.correct(current_user, event_id, payload.model_dump(exclude_unset=True))


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    event_id: int,
    current_user: User = Depends(get_current_user),
    events: EventService = Depends(get_event_service),
) -> None:
    events.delete(current_user, event_id)
