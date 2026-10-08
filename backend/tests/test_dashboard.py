from app.ai.providers.mock import MockProvider
from app.services.intelligence import NO_DATA_RECOMMENDATION


def auth_headers(client) -> dict[str, str]:
    response = client.post("/api/v1/auth/register", json={"email": "dash@example.com", "password": "correct-horse"})
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_new_user_dashboard_has_no_fake_recommendation(client):
    data = client.get("/api/v1/dashboard", headers=auth_headers(client)).json()

    assert all(cs["event_count"] == 0 for cs in data["category_scores"])
    assert data["recommendation"] == NO_DATA_RECOMMENDATION
    assert "_" not in data["top_observation"]
    for forecast in data["forecast_7day"]:
        assert "personal_growth" not in forecast["narrative"]


def test_dashboard_after_an_update(client):
    headers = auth_headers(client)
    response = client.post(
        "/api/v1/updates",
        headers=headers,
        json={"content": "Went to the gym this morning, felt great. Finished a Python course chapter."},
    )
    assert response.status_code in (200, 201)

    data = client.get("/api/v1/dashboard", headers=headers).json()
    counts = {cs["category"]: cs["event_count"] for cs in data["category_scores"]}
    assert counts["health"] >= 1
    assert counts["learning"] >= 1
    assert data["recommendation"] != NO_DATA_RECOMMENDATION
    assert "insufficient_evidence" not in data["recommendation"]


def test_mock_narratives_use_readable_names():
    provider = MockProvider()
    forecast = provider.generate_narrative(
        kind="forecast", context={"category": "personal_growth", "direction": "insufficient_evidence"}
    )
    assert forecast == "Not enough data yet to forecast personal growth — keep logging updates."

    recommendation = provider.generate_narrative(
        kind="recommendation", context={"category": "personal_growth", "score": 52, "trend": "insufficient_evidence"}
    )
    assert "personal growth" in recommendation
    assert "_" not in recommendation

    stable = provider.generate_narrative(
        kind="recommendation", context={"category": "health", "score": 60, "trend": "stable"}
    )
    assert "is trending stable" in stable

    summary = provider.generate_narrative(
        kind="weekly_summary",
        context={"total_events": 2, "category_counts": {"personal_growth": 2}, "period": "week",
                 "category_deltas": {"personal_growth": 2}},
    )
    assert "mostly in personal growth" in summary
    assert "Personal growth activity increased by 2" in summary
