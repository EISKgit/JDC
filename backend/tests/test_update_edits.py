def auth_headers(client) -> dict[str, str]:
    response = client.post("/api/v1/auth/register", json={"email": "edit@example.com", "password": "correct-horse"})
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_update_keeps_raw_text_but_events_are_polished(client):
    headers = auth_headers(client)
    raw = "Completed my daily workout durning evening time. and also learning C++ lanuguage"
    data = client.post("/api/v1/updates", headers=headers, json={"content": raw}).json()

    assert data["content"] == raw
    assert [e["description"] for e in data["events"]] == [
        "Completed my daily workout during evening time.",
        "Learning C++ language.",
    ]


def test_editing_an_update_re_extracts_its_events(client):
    headers = auth_headers(client)
    created = client.post("/api/v1/updates", headers=headers, json={"content": "Went to the gym"}).json()

    response = client.patch(
        f"/api/v1/updates/{created['id']}",
        headers=headers,
        json={"content": "Went to the gym. Studied Python for 2 hours."},
    )
    assert response.status_code == 200
    edited = response.json()
    assert edited["content"] == "Went to the gym. Studied Python for 2 hours."
    assert edited["created_at"] == created["created_at"]
    assert [e["category"] for e in edited["events"]] == ["health", "learning"]
    assert all(e["created_at"] == created["created_at"] for e in edited["events"])

    listed = client.get("/api/v1/updates", headers=headers).json()
    assert len(listed[0]["events"]) == 2


def test_editing_one_event_description(client):
    headers = auth_headers(client)
    created = client.post("/api/v1/updates", headers=headers, json={"content": "Went to the gym"}).json()
    event_id = created["events"][0]["id"]

    event = client.patch(
        f"/api/v1/events/{event_id}", headers=headers, json={"description": "Went to the gym for leg day."}
    ).json()
    assert event["description"] == "Went to the gym for leg day."
    assert event["is_corrected"] is True


def test_cannot_edit_someone_elses_update(client):
    created = client.post("/api/v1/updates", headers=auth_headers(client), json={"content": "Went to the gym"}).json()
    other = client.post("/api/v1/auth/register", json={"email": "other@example.com", "password": "correct-horse"})
    other_headers = {"Authorization": f"Bearer {other.json()['access_token']}"}

    response = client.patch(f"/api/v1/updates/{created['id']}", headers=other_headers, json={"content": "hacked"})
    assert response.status_code == 404


def test_editing_an_update_keeps_hand_fixed_categories(client):
    headers = auth_headers(client)
    created = client.post(
        "/api/v1/updates", headers=headers, json={"content": "Played basketball with my cousins. Went to the gym."}
    ).json()
    basketball = created["events"][0]
    client.patch(f"/api/v1/events/{basketball['id']}", headers=headers, json={"category": "health"})

    edited = client.patch(
        f"/api/v1/updates/{created['id']}",
        headers=headers,
        json={"content": "Played basketball with my cousins for 2 hr. Went to the gym. Studied Python."},
    ).json()

    first = edited["events"][0]
    assert first["description"] == "Played basketball with my cousins for 2 hours."  # follows the new text
    assert first["category"] == "health"  # the hand fix survives
    assert first["is_corrected"] is True
    assert [e["is_corrected"] for e in edited["events"][1:]] == [False, False]


def test_correction_for_a_removed_sentence_is_dropped(client):
    headers = auth_headers(client)
    created = client.post(
        "/api/v1/updates", headers=headers, json={"content": "Played basketball with my cousins. Went to the gym."}
    ).json()
    client.patch(f"/api/v1/events/{created['events'][0]['id']}", headers=headers, json={"category": "health"})

    edited = client.patch(f"/api/v1/updates/{created['id']}", headers=headers, json={"content": "Went to the gym."})
    events = edited.json()["events"]
    assert [(e["description"], e["is_corrected"]) for e in events] == [("Went to the gym.", False)]
