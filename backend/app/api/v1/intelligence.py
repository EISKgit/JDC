from fastapi import APIRouter, Depends

from app.api.deps import get_current_user, get_intelligence_service
from app.domain.errors import InvalidInput
from app.models.user import User
from app.schemas.intelligence import DashboardOut, ForecastOut, PeriodSummary
from app.services.intelligence import IntelligenceService

router = APIRouter(tags=["intelligence"])


@router.get("/intelligence/daily", response_model=PeriodSummary)
def daily_intelligence(
    current_user: User = Depends(get_current_user),
    intelligence: IntelligenceService = Depends(get_intelligence_service),
) -> PeriodSummary:
    return intelligence.period_summary(current_user, "daily")


@router.get("/intelligence/weekly", response_model=PeriodSummary)
def weekly_intelligence(
    current_user: User = Depends(get_current_user),
    intelligence: IntelligenceService = Depends(get_intelligence_service),
) -> PeriodSummary:
    return intelligence.period_summary(current_user, "weekly")


@router.get("/intelligence/monthly", response_model=PeriodSummary)
def monthly_intelligence(
    current_user: User = Depends(get_current_user),
    intelligence: IntelligenceService = Depends(get_intelligence_service),
) -> PeriodSummary:
    return intelligence.period_summary(current_user, "monthly")


@router.get("/intelligence/forecast", response_model=list[ForecastOut])
def forecast(
    horizon: int = 7,
    current_user: User = Depends(get_current_user),
    intelligence: IntelligenceService = Depends(get_intelligence_service),
) -> list[ForecastOut]:
    if horizon not in (7, 30):
        raise InvalidInput("horizon must be 7 or 30")
    return intelligence.forecasts(current_user, horizon_days=horizon)


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(
    current_user: User = Depends(get_current_user),
    intelligence: IntelligenceService = Depends(get_intelligence_service),
) -> DashboardOut:
    return intelligence.dashboard(current_user)
