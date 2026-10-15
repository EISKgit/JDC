"""The Life Profile (onboarding answers + AI summary)."""

import logging
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.ai.providers.base import AIProvider, AIProviderError
from app.models.life_profile import LifeProfile
from app.models.user import User
from app.repositories.profiles import ProfileRepository

logger = logging.getLogger(__name__)


@dataclass
class ProfileService:
    session: Session
    profiles: ProfileRepository
    ai: AIProvider

    def get(self, user: User) -> LifeProfile | None:
        return self.profiles.get_for_user(user.id)

    def save(
        self,
        user: User,
        *,
        about: str | None,
        goals_text: str | None,
        challenges: str | None,
        focus_categories: list[str],
    ) -> LifeProfile:
        profile = self.profiles.get_for_user(user.id) or self.profiles.add(LifeProfile(user_id=user.id))
        profile.about = about
        profile.goals_text = goals_text
        profile.challenges = challenges
        profile.focus_categories = focus_categories
        try:
            profile.ai_summary = self.ai.generate_narrative(
                kind="life_profile",
                context={
                    "about": about,
                    "goals_text": goals_text,
                    "challenges": challenges,
                    "focus_categories": focus_categories,
                },
            )
        except AIProviderError:
            logger.warning("Life profile summary generation failed for user %s", user.id, exc_info=True)
        self.session.commit()
        self.session.refresh(profile)
        return profile
