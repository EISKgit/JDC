from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.update import Update
from app.models.user import User
from app.schemas.update import UpdateCreate, UpdateOut

router = APIRouter(prefix="/updates", tags=["updates"])


@router.post("", response_model=UpdateOut, status_code=status.HTTP_201_CREATED)
def create_update(
    payload: UpdateCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Update:
    update = Update(user_id=current_user.id, content=payload.content)
    db.add(update)
    db.commit()
    db.refresh(update)
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
    update = db.get(Update, update_id)
    if update is None or update.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Update not found")
    return update
