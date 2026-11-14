import uuid

import jwt
import pytest

from app.core import security
from app.repositories.utils import like_pattern


def test_password_hash_roundtrip():
    hashed = security.hash_password("Passw0rd!123")
    assert hashed != "Passw0rd!123"
    assert security.verify_password("Passw0rd!123", hashed)
    assert not security.verify_password("wrong-password", hashed)


def test_password_hashes_are_salted():
    assert security.hash_password("same") != security.hash_password("same")


def test_garbage_hash_is_rejected_not_raised():
    assert security.verify_password("anything", "not-a-hash") is False


def test_access_token_roundtrip():
    user_id = uuid.uuid4()
    assert security.decode_access_token(security.create_access_token(user_id)) == user_id


def test_tampered_token_is_rejected():
    header, payload, signature = security.create_access_token(uuid.uuid4()).split(".")
    with pytest.raises(jwt.InvalidTokenError):
        security.decode_access_token(f"{header}.{payload}.{signature[::-1]}")


def test_refresh_tokens_are_random_and_stored_as_hashes():
    raw_one, hash_one = security.generate_refresh_token()
    raw_two, _ = security.generate_refresh_token()
    assert raw_one != raw_two
    assert hash_one == security.hash_refresh_token(raw_one)
    assert len(hash_one) == 64
    assert raw_one not in hash_one


def test_like_pattern_escapes_wildcards():
    assert like_pattern("50%_\\") == "%50\\%\\_\\\\%"
