"""Daily / weekly / monthly summaries, forecasts and the dashboard.

Deterministic metrics first (app/services/metrics.py, pure functions), then the AI
only phrases them. Data comes from the EventRepository it's given, and wording from
the AIProvider it's given: no queries or vendor code in here.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.ai.providers.base import AIProvider
from app.models.enums import Category, Sentiment
from app.models.user import User
from app.repositories.events import EventRepository
from app.schemas.intelligence import CategoryScore, DashboardOut, EvidenceRef, ForecastOut, PeriodSummary
from app.services.forecasting import compute_trend
from app.services.metrics import (
    category_counts,
    compute_category_score,
    compute_overall_score,
    events_by_category,
)

PERIOD_DAYS = {"daily": 1, "weekly": 7, "monthly": 30}
PERIOD_LABELS = {"daily": "day", "weekly": "week", "monthly": "month"}
NEGATIVE_WARNING_THRESHOLD = 3
EVIDENCE_CAP = 5
NO_DATA_RECOMMENDATION = (
    "Log your first update on the Updates page — once there's some activity, "
    "you'll get a recommendation based on it."
)


def _focus_categories(user: User) -> list[str]:
    return user.profile.focus_categories if user.profile else []


@dataclass
class IntelligenceService:
    events: EventRepository
    ai: AIProvider

    def period_summary(self, user: User, period: str) -> PeriodSummary:
        """Daily / 7-day / 30-day intelligence: deterministic metrics first, then
        one AI call to interpret them. The AI never sees raw update text here —
        only the numbers this function already computed (see README "Deterministic
        vs. AI split").
        """
        days = PERIOD_DAYS[period]
        now = datetime.now(UTC)
        start = now - timedelta(days=days)
        prev_start = start - timedelta(days=days)

        current_events = self.events.in_range(user.id, start, now)
        previous_events = self.events.in_range(user.id, prev_start, start)
        grouped_current = events_by_category(current_events)
        grouped_previous = events_by_category(previous_events)

        focus_categories = _focus_categories(user)
        score_map: dict[Category, int] = {}
        category_scores: list[CategoryScore] = []
        evidence: dict[str, list[EvidenceRef]] = {}
        warnings: list[str] = []

        for category in Category:
            cat_events = grouped_current[category]
            prev_cat_events = grouped_previous[category]
            score = compute_category_score(cat_events, days)
            score_map[category] = score

            trend = compute_trend(len(cat_events), len(prev_cat_events), len(cat_events) + len(prev_cat_events))
            category_scores.append(
                CategoryScore(
                    category=category,
                    score=score,
                    event_count=len(cat_events),
                    trend=trend.direction,
                    confidence=trend.confidence,
                )
            )

            if cat_events:
                evidence[category.value] = [
                    EvidenceRef(event_id=e.id, update_id=e.update_id, description=e.description)
                    for e in cat_events[:EVIDENCE_CAP]
                ]

            negative_count = sum(1 for e in cat_events if e.sentiment == Sentiment.negative)
            if negative_count >= NEGATIVE_WARNING_THRESHOLD:
                warnings.append(
                    self.ai.generate_narrative(
                        kind="warning",
                        context={"category": category.value, "negative_count": negative_count, "period_days": days},
                    )
                )

        deltas = {
            cat.value: len(grouped_current[cat]) - len(grouped_previous[cat])
            for cat in Category
            if len(grouped_current[cat]) != len(grouped_previous[cat])
        }

        narrative = self.ai.generate_narrative(
            kind=f"{period}_summary",
            context={
                "total_events": len(current_events),
                "category_counts": category_counts(current_events),
                "period": PERIOD_LABELS[period],
                "category_deltas": deltas,
            },
        )

        return PeriodSummary(
            period=period,
            start=start,
            end=now,
            total_events=len(current_events),
            category_counts=category_counts(current_events),
            category_scores=category_scores,
            overall_score=compute_overall_score(score_map, focus_categories),
            narrative=narrative,
            warnings=warnings,
            evidence=evidence,
        )


    def forecasts(self, user: User, horizon_days: int) -> list[ForecastOut]:
        now = datetime.now(UTC)
        start = now - timedelta(days=horizon_days)
        prev_start = start - timedelta(days=horizon_days)

        grouped_current = events_by_category(self.events.in_range(user.id, start, now))
        grouped_previous = events_by_category(self.events.in_range(user.id, prev_start, start))

        forecasts = []
        for category in Category:
            current_count = len(grouped_current[category])
            previous_count = len(grouped_previous[category])
            trend = compute_trend(current_count, previous_count, current_count + previous_count)
            narrative = self.ai.generate_narrative(
                kind="forecast",
                context={
                    "category": category.value,
                    "direction": trend.direction,
                    "confidence": trend.confidence,
                    "pct_change": trend.pct_change,
                    "horizon_days": horizon_days,
                },
            )
            forecasts.append(
                ForecastOut(
                    category=category,
                    horizon_days=horizon_days,
                    direction=trend.direction,
                    confidence=trend.confidence,
                    pct_change=trend.pct_change,
                    narrative=narrative,
                )
            )
        return forecasts


    def dashboard(self, user: User) -> DashboardOut:
        """The 3-5 things that actually matter, not the 20 things the backend could
        generate — see README "Don't overwhelm the user with AI output".
        """
        weekly = self.period_summary(user, "weekly")
        forecast_7day = self.forecasts(user, horizon_days=7)

        if weekly.total_events == 0:
            # Every category sits at the neutral baseline, so "lowest" would just be
            # whichever comes first — don't dress that up as a real recommendation.
            recommendation = NO_DATA_RECOMMENDATION
        else:
            # Only categories with activity have a real score; untouched ones sit at
            # the 50 baseline and would otherwise "win" as lowest (the dashboard
            # shows them as "—", so quoting 50/100 for them would contradict it).
            active = [cs for cs in weekly.category_scores if cs.event_count > 0]
            lowest = min(active, key=lambda cs: cs.score)
            recommendation = self.ai.generate_narrative(
                kind="recommendation",
                context={"category": lowest.category.value, "score": lowest.score, "trend": lowest.trend},
            )

        return DashboardOut(
            overall_score=weekly.overall_score,
            category_scores=weekly.category_scores,
            top_observation=weekly.narrative,
            warnings=weekly.warnings,
            recommendation=recommendation,
            forecast_7day=forecast_7day,
        )
