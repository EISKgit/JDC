import pytest

from app.ai.providers.base import AIProviderError
from app.ai.providers.mock import MockProvider
from app.db.session import SessionLocal
from app.models.event import Event
from app.models.update import Update
from app.services.event_extraction import reextract_events


def auth_headers(client, email="del@example.com") -> dict[str, str]:
    response = client.post("/api/v1/auth/register", json={"email": email, "password": "correct-horse"})
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def event_counts(client, headers) -> dict[str, int]:
    dashboard = client.get("/api/v1/dashboard", headers=headers).json()
    return {cs["category"]: cs["event_count"] for cs in dashboard["category_scores"] if cs["event_count"]}


def test_deleting_an_update_removes_it_and_its_events(client):
    headers = auth_headers(client)
    keep = client.post("/api/v1/updates", headers=headers, json={"content": "Went to the gym"}).json()
    gone = client.post(
        "/api/v1/updates", headers=headers, json={"content": "Studied Python for 2 hours. Spent $40 on groceries."}
    ).json()
    assert event_counts(client, headers) == {"health": 1, "learning": 1, "finance": 1}

    assert client.delete(f"/api/v1/updates/{gone['id']}", headers=headers).status_code == 204

    assert [u["id"] for u in client.get("/api/v1/updates", headers=headers).json()] == [keep["id"]]
    assert client.get(f"/api/v1/updates/{gone['id']}", headers=headers).status_code == 404
    with SessionLocal() as db:
        assert db.query(Event).filter(Event.update_id == gone["id"]).count() == 0
    # The dashboard is computed from the remaining events, so it re-estimates immediately.
    assert event_counts(client, headers) == {"health": 1}


def test_deleting_the_only_update_returns_dashboard_to_empty_state(client):
    headers = auth_headers(client)
    created = client.post("/api/v1/updates", headers=headers, json={"content": "Went to the gym"}).json()
    client.delete(f"/api/v1/updates/{created['id']}", headers=headers)

    dashboard = client.get("/api/v1/dashboard", headers=headers).json()
    assert all(cs["event_count"] == 0 for cs in dashboard["category_scores"])
    assert dashboard["recommendation"].startswith("Log your first update")


def test_cannot_delete_someone_elses_update(client):
    headers = auth_headers(client)
    created = client.post("/api/v1/updates", headers=headers, json={"content": "Went to the gym"}).json()
    other = auth_headers(client, "other@example.com")

    assert client.delete(f"/api/v1/updates/{created['id']}", headers=other).status_code == 404
    assert client.get(f"/api/v1/updates/{created['id']}", headers=headers).status_code == 200


def test_editing_moves_dashboard_counts_to_the_new_categories(client):
    headers = auth_headers(client)
    created = client.post("/api/v1/updates", headers=headers, json={"content": "Went to the gym"}).json()
    assert event_counts(client, headers) == {"health": 1}

    client.patch(
        f"/api/v1/updates/{created['id']}", headers=headers, json={"content": "Spent $40 on groceries"}
    )
    assert event_counts(client, headers) == {"finance": 1}


class _FailingProvider(MockProvider):
    def extract_events(self, update_text):
        raise AIProviderError("simulated outage")


def test_failed_re_extraction_keeps_the_previous_events(client):
    headers = auth_headers(client)
    created = client.post("/api/v1/updates", headers=headers, json={"content": "Went to the gym"}).json()

    with SessionLocal() as db:
        update = db.get(Update, created["id"])
        update.content = "Studied Python"
        with pytest.raises(AIProviderError):
            reextract_events(db, update, _FailingProvider())
        db.rollback()
        db.refresh(update)
        assert [e.category.value for e in update.events] == ["health"]
