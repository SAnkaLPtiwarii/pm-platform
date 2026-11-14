from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.auth import LoginRequest, RefreshRequest, RegisterRequest, TokenResponse
from app.schemas.user import UserResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=201)
def register(payload: RegisterRequest, db: DbSession):
    return AuthService(db).register(payload.email, payload.name, payload.password)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: DbSession):
    return AuthService(db).login(payload.email, payload.password)


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: DbSession):
    return AuthService(db).refresh(payload.refresh_token)


@router.post("/logout", status_code=204)
def logout(payload: RefreshRequest, db: DbSession) -> None:
    AuthService(db).logout(payload.refresh_token)


@router.get("/me", response_model=UserResponse)
def me(current_user: CurrentUser):
    return current_user
