from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.ai.factory import get_ai_provider
from app.ai.providers.base import AIProvider
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.intelligence import DashboardOut, ForecastOut, PeriodSummary
from app.services.intelligence import generate_dashboard, generate_forecasts, generate_period_summary

router = APIRouter(tags=["intelligence"])


@router.get("/intelligence/daily", response_model=PeriodSummary)
def daily_intelligence(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    ai_provider: AIProvider = Depends(get_ai_provider),
) -> PeriodSummary:
    return generate_period_summary(db, current_user, "daily", ai_provider)


@router.get("/intelligence/weekly", response_model=PeriodSummary)
def weekly_intelligence(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    ai_provider: AIProvider = Depends(get_ai_provider),
) -> PeriodSummary:
    return generate_period_summary(db, current_user, "weekly", ai_provider)


@router.get("/intelligence/monthly", response_model=PeriodSummary)
def monthly_intelligence(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    ai_provider: AIProvider = Depends(get_ai_provider),
) -> PeriodSummary:
    return generate_period_summary(db, current_user, "monthly", ai_provider)


@router.get("/intelligence/forecast", response_model=list[ForecastOut])
def forecast(
    horizon: int = 7,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    ai_provider: AIProvider = Depends(get_ai_provider),
) -> list[ForecastOut]:
    if horizon not in (7, 30):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="horizon must be 7 or 30")
    return generate_forecasts(db, current_user, ai_provider, horizon_days=horizon)


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    ai_provider: AIProvider = Depends(get_ai_provider),
) -> DashboardOut:
    return generate_dashboard(db, current_user, ai_provider)
