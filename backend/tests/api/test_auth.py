from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
import pytest
from sqlalchemy import select, update

from app.core.config import get_settings
from app.models.refresh_token import RefreshToken
from app.models.user import User
from tests.api.helpers import API, PASSWORD, error_code

WRONG_SECRET = "another-secret-key-used-only-in-the-tests"


def register(client, email="alice@example.com", name="Alice", password=PASSWORD):
    payload = {"email": email, "name": name, "password": password}
    return client.post(f"{API}/auth/register", json=payload)


def login(client, email="alice@example.com", password=PASSWORD):
    return client.post(f"{API}/auth/login", json={"email": email, "password": password})


def forged_token(*, sub, expires_in, secret=None, token_type="access"):
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {"sub": sub, "type": token_type, "iat": now, "exp": now + expires_in}
    return jwt.encode(payload, secret or settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def test_register_creates_a_user_without_exposing_the_password(client):
    response = register(client)
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "alice@example.com"
    assert "password" not in body
    assert "password_hash" not in body


def test_password_is_stored_as_an_argon2_hash(client, db):
    register(client)
    stored = db.scalar(select(User.password_hash).where(User.email == "alice@example.com"))
    assert stored.startswith("$argon2")
    assert PASSWORD not in stored


def test_duplicate_email_is_rejected_case_insensitively(client):
    assert register(client).status_code == 201
    response = register(client, email="ALICE@example.com")
    assert response.status_code == 409
    assert error_code(response) == "conflict"


@pytest.mark.parametrize(
    "payload",
    [
        {"email": "not-an-email", "name": "A", "password": PASSWORD},
        {"email": "a@example.com", "name": "A", "password": "short"},
        {"email": "a@example.com", "name": "   ", "password": PASSWORD},
        {"email": "a@example.com", "password": PASSWORD},
    ],
)
def test_register_validates_input(client, payload):
    response = client.post(f"{API}/auth/register", json=payload)
    assert response.status_code == 422
    assert error_code(response) == "validation_error"
    assert response.json()["error"]["details"]


def test_login_returns_tokens_and_ignores_email_case(client):
    register(client)
    response = login(client, email="ALICE@example.com")
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["refresh_token"]


def test_login_failures_do_not_reveal_whether_the_email_exists(client):
    register(client)
    wrong_password = login(client, password="WrongPassw0rd!")
    unknown_email = login(client, email="nobody@example.com")
    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()


def test_me_returns_the_current_user(client, make_user):
    alice = make_user("alice")
    response = client.get(f"{API}/auth/me", headers=alice.headers)
    assert response.status_code == 200
    assert response.json()["email"] == alice.email


def test_me_requires_a_token(client):
    response = client.get(f"{API}/auth/me")
    assert response.status_code == 401
    assert error_code(response) == "unauthorized"
    assert response.headers["www-authenticate"] == "Bearer"


def test_me_rejects_invalid_tokens(client, make_user):
    alice = make_user("alice")
    valid = timedelta(minutes=5)
    bad_tokens = {
        "garbage": "not-a-jwt",
        "expired": forged_token(sub=alice.id, expires_in=timedelta(minutes=-1)),
        "wrong secret": forged_token(sub=alice.id, expires_in=valid, secret=WRONG_SECRET),
        "wrong type": forged_token(sub=alice.id, expires_in=valid, token_type="refresh"),
        "unknown user": forged_token(sub=str(uuid4()), expires_in=valid),
        "refresh token used as bearer": alice.refresh_token,
    }
    for label, token in bad_tokens.items():
        response = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401, label
        assert error_code(response) == "unauthorized", label


def test_refresh_rotates_the_token_pair(client, make_user):
    alice = make_user("alice")
    refreshed = client.post(f"{API}/auth/refresh", json={"refresh_token": alice.refresh_token})
    assert refreshed.status_code == 200
    rotated = refreshed.json()
    assert rotated["refresh_token"] != alice.refresh_token

    reuse = client.post(f"{API}/auth/refresh", json={"refresh_token": alice.refresh_token})
    assert reuse.status_code == 401

    me = client.get(
        f"{API}/auth/me", headers={"Authorization": f"Bearer {rotated['access_token']}"}
    )
    assert me.status_code == 200
    again = client.post(f"{API}/auth/refresh", json={"refresh_token": rotated["refresh_token"]})
    assert again.status_code == 200


def test_expired_refresh_token_is_rejected(client, db, make_user):
    alice = make_user("alice")
    db.execute(update(RefreshToken).values(expires_at=datetime.now(UTC) - timedelta(minutes=1)))
    db.commit()
    response = client.post(f"{API}/auth/refresh", json={"refresh_token": alice.refresh_token})
    assert response.status_code == 401


def test_logout_revokes_the_refresh_token(client, make_user):
    alice = make_user("alice")
    body = {"refresh_token": alice.refresh_token}
    assert client.post(f"{API}/auth/logout", json=body).status_code == 204
    assert client.post(f"{API}/auth/refresh", json=body).status_code == 401


def test_logout_is_idempotent(client, make_user):
    alice = make_user("alice")
    body = {"refresh_token": alice.refresh_token}
    assert client.post(f"{API}/auth/logout", json=body).status_code == 204
    assert client.post(f"{API}/auth/logout", json=body).status_code == 204
    unknown = {"refresh_token": "never-issued"}
    assert client.post(f"{API}/auth/logout", json=unknown).status_code == 204
