import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.ai.factory import get_ai_provider
from app.ai.providers.base import AIProvider, AIProviderError
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.update import Update
from app.models.user import User
from app.schemas.update import UpdateCreate, UpdateOut
from app.services.event_extraction import extract_and_store_events, reextract_events

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/updates", tags=["updates"])


@router.post("", response_model=UpdateOut, status_code=status.HTTP_201_CREATED)
def create_update(
    payload: UpdateCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    ai_provider: AIProvider = Depends(get_ai_provider),
) -> Update:
    # The user's raw words are the source of truth and are saved first —
    # AI extraction is best-effort on top and must never risk losing the update.
    update = Update(user_id=current_user.id, content=payload.content)
    db.add(update)
    db.commit()
    db.refresh(update)

    try:
        extract_and_store_events(db, update, ai_provider)
        db.refresh(update)
    except AIProviderError:
        logger.warning("Event extraction failed for update %s", update.id, exc_info=True)

    return update


@router.patch("/{update_id}", response_model=UpdateOut)
def edit_update(
    update_id: int,
    payload: UpdateCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    ai_provider: AIProvider = Depends(get_ai_provider),
) -> Update:
    """Replace an update's text and re-extract its events from the new wording.

    Statements follow the new text; categories the user fixed by hand are kept
    for sentences that are still there (see `reextract_events`).
    """
    update = _get_owned_update(db, update_id, current_user)
    update.content = payload.content
    db.commit()

    try:
        reextract_events(db, update, ai_provider)
    except AIProviderError:
        logger.warning("Event extraction failed for edited update %s", update.id, exc_info=True)

    return update


@router.get("", response_model=list[UpdateOut])
def list_updates(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Update]:
    return (
        db.query(Update)
        .filter(Update.user_id == current_user.id)
        .order_by(Update.created_at.desc())
        .all()
    )


@router.get("/{update_id}", response_model=UpdateOut)
def get_update(
    update_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Update:
    return _get_owned_update(db, update_id, current_user)


def _get_owned_update(db: Session, update_id: int, user: User) -> Update:
    update = db.get(Update, update_id)
    if update is None or update.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Update not found")
    return update
