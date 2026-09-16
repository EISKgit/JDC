import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.ai.factory import get_ai_provider
from app.ai.providers.base import AIProvider, AIProviderError
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.life_profile import LifeProfile
from app.models.user import User
from app.schemas.onboarding import LifeProfileIn, LifeProfileOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@router.get("", response_model=LifeProfileOut | None)
def get_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LifeProfile | None:
    return db.query(LifeProfile).filter(LifeProfile.user_id == current_user.id).first()


@router.put("", response_model=LifeProfileOut)
def upsert_profile(
    payload: LifeProfileIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    ai_provider: AIProvider = Depends(get_ai_provider),
) -> LifeProfile:
    profile = db.query(LifeProfile).filter(LifeProfile.user_id == current_user.id).first()
    if profile is None:
        profile = LifeProfile(user_id=current_user.id)
        db.add(profile)

    profile.about = payload.about
    profile.goals_text = payload.goals_text
    profile.challenges = payload.challenges
    profile.focus_categories = [c.value for c in payload.focus_categories]

    try:
        profile.ai_summary = ai_provider.generate_narrative(
            kind="life_profile",
            context={
                "about": profile.about,
                "goals_text": profile.goals_text,
                "challenges": profile.challenges,
                "focus_categories": profile.focus_categories,
            },
        )
    except AIProviderError:
        logger.warning("Life profile summary generation failed for user %s", current_user.id, exc_info=True)

    db.commit()
    db.refresh(profile)
    return profile
