from datetime import datetime, timezone


def test_timestamps_are_serialized_as_utc(client):
    token = client.post(
        "/api/v1/auth/register", json={"email": "tz@example.com", "password": "correct-horse"}
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    created = client.post("/api/v1/updates", headers=headers, json={"content": "Went to the gym"}).json()
    listed = client.get("/api/v1/updates", headers=headers).json()[0]

    for value in (created["created_at"], listed["created_at"], created["events"][0]["created_at"]):
        # An explicit offset is what lets the browser convert to the user's local
        # day correctly; a bare "2026-10-09T16:47:52" would be read as local time.
        parsed = datetime.fromisoformat(value)
        assert parsed.utcoffset() == timezone.utc.utcoffset(None)
        assert abs((datetime.now(timezone.utc) - parsed).total_seconds()) < 60
