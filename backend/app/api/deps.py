from typing import Annotated

import jwt
from fastapi import Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.exceptions import UnauthorizedError
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas.common import PageParams

DbSession = Annotated[Session, Depends(get_db)]

# auto_error=False so a missing header goes through our own 401 error envelope.
bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: DbSession,
) -> User:
    if credentials is None:
        raise UnauthorizedError("Not authenticated")
    try:
        user_id = decode_access_token(credentials.credentials)
    except (jwt.InvalidTokenError, ValueError) as exc:
        raise UnauthorizedError("Invalid or expired token") from exc

    user = UserRepository(db).get_by_id(user_id)
    if user is None:
        raise UnauthorizedError("User no longer exists")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_pagination(
    page: Annotated[int, Query(ge=1, description="Page number, starting at 1")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 20,
) -> PageParams:
    return PageParams(page=page, page_size=page_size)


Pagination = Annotated[PageParams, Depends(get_pagination)]
