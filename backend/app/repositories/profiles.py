from app.models.life_profile import LifeProfile
from app.repositories.base import Repository


class ProfileRepository(Repository[LifeProfile]):
    model = LifeProfile

    def get_for_user(self, user_id: int) -> LifeProfile | None:
        return self.session.query(LifeProfile).filter(LifeProfile.user_id == user_id).first()
