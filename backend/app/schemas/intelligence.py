from pydantic import BaseModel

from app.models.enums import Category
from app.schemas.common import UTCDateTime


class EvidenceRef(BaseModel):
    event_id: int
    update_id: int
    description: str


class CategoryScore(BaseModel):
    category: Category
    score: int
    event_count: int
    trend: str
    confidence: str


class PeriodSummary(BaseModel):
    period: str
    start: UTCDateTime
    end: UTCDateTime
    total_events: int
    category_counts: dict[str, int]
    category_scores: list[CategoryScore]
    overall_score: int
    narrative: str
    warnings: list[str]
    evidence: dict[str, list[EvidenceRef]]


class ForecastOut(BaseModel):
    category: Category
    horizon_days: int
    direction: str
    confidence: str
    pct_change: float | None
    narrative: str


class DashboardOut(BaseModel):
    overall_score: int
    category_scores: list[CategoryScore]
    top_observation: str
    warnings: list[str]
    recommendation: str
    forecast_7day: list[ForecastOut]
