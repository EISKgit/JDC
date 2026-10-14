API = "/api/v1/auth"


def register(client, email="user@example.com", password="correct-horse"):
    return client.post(f"{API}/register", json={"email": email, "password": password})


def test_health(client):
    assert client.get("/health").json() == {"status": "ok", "database": "ok"}


def test_register_login_and_me(client):
    response = register(client)
    assert response.status_code == 201

    login = client.post(f"{API}/login", json={"email": "user@example.com", "password": "correct-horse"})
    assert login.status_code == 200
    token = login.json()["access_token"]

    me = client.get(f"{API}/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "user@example.com"


def test_register_rejects_short_password(client):
    assert register(client, password="short").status_code == 422


def test_register_rejects_overlong_password(client):
    assert register(client, password="x" * 73).status_code == 422


def test_email_is_case_insensitive(client):
    assert register(client, email="Mixed.Case@Example.com").status_code == 201
    assert register(client, email="mixed.case@example.com").status_code == 409

    login = client.post(f"{API}/login", json={"email": "MIXED.CASE@example.com", "password": "correct-horse"})
    assert login.status_code == 200


def test_login_wrong_password(client):
    register(client)
    login = client.post(f"{API}/login", json={"email": "user@example.com", "password": "wrong-password"})
    assert login.status_code == 401


def test_me_requires_valid_token(client):
    assert client.get(f"{API}/me").status_code == 401
    assert client.get(f"{API}/me", headers={"Authorization": "Bearer garbage"}).status_code == 401
