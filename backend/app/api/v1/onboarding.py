from fastapi import APIRouter, Depends

from app.api.deps import get_current_user, get_profile_service
from app.models.life_profile import LifeProfile
from app.models.user import User
from app.schemas.onboarding import LifeProfileIn, LifeProfileOut
from app.services.profile_service import ProfileService

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@router.get("", response_model=LifeProfileOut | None)
def get_profile(
    current_user: User = Depends(get_current_user), profiles: ProfileService = Depends(get_profile_service)
) -> LifeProfile | None:
    return profiles.get(current_user)


@router.put("", response_model=LifeProfileOut)
def upsert_profile(
    payload: LifeProfileIn,
    current_user: User = Depends(get_current_user),
    profiles: ProfileService = Depends(get_profile_service),
) -> LifeProfile:
    return profiles.save(
        current_user,
        about=payload.about,
        goals_text=payload.goals_text,
        challenges=payload.challenges,
        focus_categories=[c.value for c in payload.focus_categories],
    )
