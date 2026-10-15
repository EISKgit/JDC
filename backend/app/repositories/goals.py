from app.models.goal import Goal
from app.repositories.base import OwnedRepository


class GoalRepository(OwnedRepository[Goal]):
    model = Goal
    label = "Goal"

    def list_for_user(self, user_id: int) -> list[Goal]:
        return self.session.query(Goal).filter(Goal.user_id == user_id).order_by(Goal.created_at.desc()).all()
