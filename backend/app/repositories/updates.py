from datetime import datetime

from app.models.update import Update
from app.repositories.base import OwnedRepository


class UpdateRepository(OwnedRepository[Update]):
    model = Update
    label = "Update"

    def list_for_user(
        self,
        user_id: int,
        *,
        start: datetime | None = None,
        end: datetime | None = None,
        newest_first: bool = True,
    ) -> list[Update]:
        """The user's updates (with events, loaded in one extra query), optionally in [start, end)."""
        query = self.session.query(Update).filter(Update.user_id == user_id)
        if start is not None:
            query = query.filter(Update.created_at >= start)
        if end is not None:
            query = query.filter(Update.created_at < end)
        order = Update.created_at.desc() if newest_first else Update.created_at
        return query.order_by(order).all()

    def ids_for_user(self, user_id: int) -> set[int]:
        return {row[0] for row in self.session.query(Update.id).filter(Update.user_id == user_id).all()}

    def get_many_owned(self, user_id: int, ids: list[int]) -> list[Update]:
        """The user's updates with these ids, in the order the ids were given (others skipped)."""
        if not ids:
            return []
        found = {
            u.id: u
            for u in self.session.query(Update).filter(Update.user_id == user_id, Update.id.in_(ids)).all()
        }
        return [found[i] for i in ids if i in found]

    def list_all(self, user_id: int | None = None) -> list[Update]:
        """Every update (optionally one user's), oldest first. For maintenance scripts."""
        query = self.session.query(Update)
        if user_id is not None:
            query = query.filter(Update.user_id == user_id)
        return query.order_by(Update.id).all()
