from app.models.user import User
from app.repositories.base import Repository


class UserRepository(Repository[User]):
    model = User

    def get_by_email(self, email: str) -> User | None:
        return self.session.query(User).filter(User.email == email).first()

    def get_by_google_id(self, google_id: str) -> User | None:
        return self.session.query(User).filter(User.google_id == google_id).first()
