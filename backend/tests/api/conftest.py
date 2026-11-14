from types import SimpleNamespace

import pytest
from argon2 import PasswordHasher
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app import models  # noqa: F401  (registers every table on Base.metadata)
from app.core import security
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.main import app as fastapi_app
from tests.api.helpers import API, PASSWORD, Account, add_member, create_project


@pytest.fixture(scope="session", autouse=True)
def fast_password_hashing():
    """Production Argon2 settings are deliberately slow; use cheap ones in tests."""
    patch = pytest.MonkeyPatch()
    cheap = PasswordHasher(time_cost=1, memory_cost=1024, parallelism=1)
    patch.setattr(security, "_hasher", cheap)
    patch.setattr(security, "_DUMMY_HASH", cheap.hash("timing-equalizer-password"))
    yield
    patch.undo()


@pytest.fixture(scope="session", autouse=True)
def database():
    name = engine.url.database or ""
    if not name.endswith("_test"):
        pytest.exit(f"Refusing to run API tests on non-test database {name!r}", returncode=2)
    try:
        with engine.begin() as connection:
            connection.execute(text("SELECT 1"))
    except OperationalError:
        pytest.exit(
            "Cannot reach the test database. Start pm-db and create it with:\n"
            'docker exec pm-db psql -U pm_user -d postgres -c "CREATE DATABASE pm_test"',
            returncode=2,
        )
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def clean_tables(database):
    yield
    tables = ", ".join(f'"{table.name}"' for table in Base.metadata.sorted_tables)
    with engine.begin() as connection:
        connection.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


@pytest.fixture
def client() -> TestClient:
    return TestClient(fastapi_app)


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def make_user(client):
    def _make(name: str) -> Account:
        email = f"{name.lower()}@example.com"
        payload = {"email": email, "name": name, "password": PASSWORD}
        registered = client.post(f"{API}/auth/register", json=payload)
        assert registered.status_code == 201, registered.text
        logged_in = client.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD})
        assert logged_in.status_code == 200, logged_in.text
        tokens = logged_in.json()
        return Account(
            id=registered.json()["id"],
            name=name,
            email=email,
            access_token=tokens["access_token"],
            refresh_token=tokens["refresh_token"],
        )

    return _make


@pytest.fixture
def team(client, make_user):
    """alice owns the project; bob and carol are members; dave is an outsider."""
    alice, bob, carol, dave = (make_user(name) for name in ("alice", "bob", "carol", "dave"))
    created = create_project(client, alice)
    assert created.status_code == 201, created.text
    project_id = created.json()["id"]
    for member in (bob, carol):
        assert add_member(client, alice, project_id, member).status_code == 201
    return SimpleNamespace(alice=alice, bob=bob, carol=carol, dave=dave, project_id=project_id)
