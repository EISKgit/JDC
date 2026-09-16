from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.event import Event
from app.models.user import User
from app.schemas.event import EventCorrection, EventOut

router = APIRouter(prefix="/events", tags=["events"])


@router.patch("/{event_id}", response_model=EventOut)
def correct_event(
    event_id: int,
    payload: EventCorrection,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Event:
    event = db.get(Event, event_id)
    if event is None or event.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(event, field, value)
    if changes:
        event.is_corrected = True

    db.commit()
    db.refresh(event)
    return event


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    event_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Mark an extracted event as irrelevant by removing it (the source update stays intact)."""
    event = db.get(Event, event_id)
    if event is None or event.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    db.delete(event)
    db.commit()
