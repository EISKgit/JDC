from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.life_profile import LifeProfile
from app.models.user import User
from app.schemas.onboarding import LifeProfileIn, LifeProfileOut

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
) -> LifeProfile:
    profile = db.query(LifeProfile).filter(LifeProfile.user_id == current_user.id).first()
    if profile is None:
        profile = LifeProfile(user_id=current_user.id)
        db.add(profile)

    profile.about = payload.about
    profile.goals_text = payload.goals_text
    profile.challenges = payload.challenges
    profile.focus_categories = [c.value for c in payload.focus_categories]

    db.commit()
    db.refresh(profile)
    return profile
