from fastapi import APIRouter, Depends, status

from app.api.deps import get_current_user, get_update_service
from app.api.rate_limits import limit_by_user
from app.models.update import Update
from app.models.user import User
from app.schemas.update import UpdateCreate, UpdateOut
from app.services.update_service import UpdateService

router = APIRouter(prefix="/updates", tags=["updates"])

# Creating and editing call the AI to extract events.
ai_rate_limit = Depends(limit_by_user("ai"))


@router.post("", response_model=UpdateOut, status_code=status.HTTP_201_CREATED, dependencies=[ai_rate_limit])
def create_update(
    payload: UpdateCreate,
    current_user: User = Depends(get_current_user),
    updates: UpdateService = Depends(get_update_service),
) -> Update:
    return updates.create(current_user, payload.content)


@router.patch("/{update_id}", response_model=UpdateOut, dependencies=[ai_rate_limit])
def edit_update(
    update_id: int,
    payload: UpdateCreate,
    current_user: User = Depends(get_current_user),
    updates: UpdateService = Depends(get_update_service),
) -> Update:
    return updates.edit(current_user, update_id, payload.content)


@router.delete("/{update_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_update(
    update_id: int,
    current_user: User = Depends(get_current_user),
    updates: UpdateService = Depends(get_update_service),
) -> None:
    updates.delete(current_user, update_id)


@router.get("", response_model=list[UpdateOut])
def list_updates(
    current_user: User = Depends(get_current_user), updates: UpdateService = Depends(get_update_service)
) -> list[Update]:
    return updates.list(current_user)


@router.get("/{update_id}", response_model=UpdateOut)
def get_update(
    update_id: int,
    current_user: User = Depends(get_current_user),
    updates: UpdateService = Depends(get_update_service),
) -> Update:
    return updates.get(current_user, update_id)
