from fastapi import APIRouter, Depends, status

from app.api.deps import get_current_user, get_goal_service
from app.models.goal import Goal
from app.models.user import User
from app.schemas.goal import GoalCreate, GoalOut, GoalUpdate
from app.services.goal_service import GoalService

router = APIRouter(prefix="/goals", tags=["goals"])


@router.post("", response_model=GoalOut, status_code=status.HTTP_201_CREATED)
def create_goal(
    payload: GoalCreate,
    current_user: User = Depends(get_current_user),
    goals: GoalService = Depends(get_goal_service),
) -> Goal:
    return goals.create(current_user, **payload.model_dump())


@router.get("", response_model=list[GoalOut])
def list_goals(
    current_user: User = Depends(get_current_user), goals: GoalService = Depends(get_goal_service)
) -> list[Goal]:
    return goals.list(current_user)


@router.patch("/{goal_id}", response_model=GoalOut)
def update_goal(
    goal_id: int,
    payload: GoalUpdate,
    current_user: User = Depends(get_current_user),
    goals: GoalService = Depends(get_goal_service),
) -> Goal:
    return goals.update(current_user, goal_id, payload.model_dump(exclude_unset=True))


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(
    goal_id: int,
    current_user: User = Depends(get_current_user),
    goals: GoalService = Depends(get_goal_service),
) -> None:
    goals.delete(current_user, goal_id)
