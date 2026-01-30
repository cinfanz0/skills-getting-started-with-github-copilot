import pytest
from fastapi.testclient import TestClient
from urllib.parse import quote

from src.app import app

client = TestClient(app)


def test_get_activities_schema():
    r = client.get("/activities")
    assert r.status_code == 200
    data = r.json()
    assert "Chess Club" in data
    assert isinstance(data["Chess Club"]["participants"], list)


def test_signup_and_unregister_flow():
    activity = "Programming Class"
    email = "pytest_user@example.com"

    # signup
    r = client.post(f"/activities/{quote(activity)}/signup", params={"email": email})
    assert r.status_code == 200
    assert email in client.get("/activities").json()[activity]["participants"]

    # duplicate signup returns 400
    r2 = client.post(f"/activities/{quote(activity)}/signup", params={"email": email})
    assert r2.status_code == 400

    # unregister
    ru = client.post(f"/activities/{quote(activity)}/unregister", params={"email": email})
    assert ru.status_code == 200
    assert email not in client.get("/activities").json()[activity]["participants"]


def test_unregister_nonmember_returns_400():
    activity = "Chess Club"
    email = "not-registered@example.com"

    r = client.post(f"/activities/{quote(activity)}/unregister", params={"email": email})
    assert r.status_code == 400


def test_activity_not_found_returns_404():
    email = "u@example.com"
    r = client.post(f"/activities/{quote('No Such Activity')}/signup", params={"email": email})
    assert r.status_code == 404

    r2 = client.post(f"/activities/{quote('No Such Activity')}/unregister", params={"email": email})
    assert r2.status_code == 404
