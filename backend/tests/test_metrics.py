from datetime import datetime, timedelta
from types import SimpleNamespace

from app.models.enums import Category, Sentiment
from app.services.metrics import compute_category_score, compute_overall_score

START = datetime(2026, 1, 1, 9, 0)


def event(day: int, sentiment: Sentiment | None = None):
    return SimpleNamespace(created_at=START + timedelta(days=day), sentiment=sentiment)


def test_no_events_scores_baseline():
    assert compute_category_score([], period_days=7) == 50


def test_activity_bonus_is_capped():
    # 20 events on one day: activity caps at +30, consistency is 1/7 * 20 ≈ 3.
    assert compute_category_score([event(0)] * 20, period_days=7) == 83


def test_score_is_clamped_to_0_100():
    positives = [event(d, Sentiment.positive) for d in range(7)]
    assert compute_category_score(positives * 3, period_days=7) == 100

    negatives = [event(0, Sentiment.negative)] * 10
    assert 0 <= compute_category_score(negatives, period_days=7) <= 100


def test_zero_period_days_does_not_divide_by_zero():
    assert compute_category_score([event(0)], period_days=0) == 55


def test_overall_score_weights_focus_categories():
    scores = {Category.health: 90, Category.finance: 50}
    assert compute_overall_score(scores, focus_categories=[]) == 70
    # health weighted 1.5x: (90*1.5 + 50) / 2.5 = 74
    assert compute_overall_score(scores, focus_categories=["health"]) == 74


def test_overall_score_empty():
    assert compute_overall_score({}, focus_categories=[]) == 0
