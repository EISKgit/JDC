"""Your data as a whole: export everything, or delete everything.

Separate from AuthService (which is about credentials and sessions): these change
for different reasons (data-protection needs vs. login rules), so they live apart.
"""

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.security import PasswordHasher
from app.domain.errors import InvalidInput
from app.models.user import User
from app.repositories.updates import UpdateRepository
from app.schemas.auth import AccountExport

DELETE_CONFIRMATION = "DELETE"


@dataclass
class AccountService:
    session: Session
    updates: UpdateRepository
    hasher: PasswordHasher

    def export(self, user: User) -> AccountExport:
        return AccountExport(
            exported_at=datetime.now(UTC),
            user=user,
            life_profile=user.profile,
            goals=user.goals,
            updates=self.updates.list_for_user(user.id, newest_first=False),
        )

    def delete(self, user: User, password: str | None, confirm: str) -> None:
        """Permanently delete the account and everything in it (profile, goals, updates, events)."""
        if confirm != DELETE_CONFIRMATION:
            raise InvalidInput(f"Type {DELETE_CONFIRMATION} to confirm")
        if user.hashed_password and not (password and self.hasher.verify(password, user.hashed_password)):
            raise InvalidInput("Password is incorrect")
        self.session.delete(user)  # cascades: profile, goals, updates -> events
        self.session.commit()
