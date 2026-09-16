from dataclasses import dataclass

MIN_SAMPLE_FOR_EVIDENCE = 3
STABLE_THRESHOLD_PCT = 15.0


@dataclass
class Trend:
    direction: str  # "improving" | "declining" | "stable" | "insufficient_evidence"
    confidence: str  # "low" | "medium" | "high"
    pct_change: float | None


def compute_trend(current_count: int, previous_count: int, total_sample: int) -> Trend:
    """Classify a category's direction from two equal-length windows.

    Deliberately conservative: with fewer than MIN_SAMPLE_FOR_EVIDENCE events
    total, we say so explicitly rather than let a tiny sample look like a
    confident trend (see README "Predictions" — avoid pretending certainty).
    """
    if total_sample < MIN_SAMPLE_FOR_EVIDENCE:
        return Trend(direction="insufficient_evidence", confidence="low", pct_change=None)

    if previous_count == 0:
        pct_change = 100.0 if current_count > 0 else 0.0
    else:
        pct_change = (current_count - previous_count) / previous_count * 100

    if pct_change > STABLE_THRESHOLD_PCT:
        direction = "improving"
    elif pct_change < -STABLE_THRESHOLD_PCT:
        direction = "declining"
    else:
        direction = "stable"

    confidence = "high" if total_sample >= 10 else "medium" if total_sample >= 5 else "low"
    return Trend(direction=direction, confidence=confidence, pct_change=round(pct_change, 1))
