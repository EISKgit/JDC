"""Use cases for goals."""

from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from app.models.goal import Goal
from app.models.user import User
from app.repositories.goals import GoalRepository


@dataclass
class GoalService:
    session: Session
    goals: GoalRepository

    def create(self, user: User, **fields: Any) -> Goal:
        goal = self.goals.add(Goal(user_id=user.id, **fields))
        self.session.commit()
        self.session.refresh(goal)
        return goal

    def list(self, user: User) -> list[Goal]:
        return self.goals.list_for_user(user.id)

    def update(self, user: User, goal_id: int, changes: dict[str, Any]) -> Goal:
        goal = self.goals.get_owned(goal_id, user.id)
        for field, value in changes.items():
            setattr(goal, field, value)
        self.session.commit()
        self.session.refresh(goal)
        return goal

    def delete(self, user: User, goal_id: int) -> None:
        self.goals.delete(self.goals.get_owned(goal_id, user.id))
        self.session.commit()
