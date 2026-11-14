import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import ConflictError, UnauthorizedError
from app.core.security import (
    burn_password_check,
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.repositories.refresh_token_repository import RefreshTokenRepository
from app.repositories.user_repository import UserRepository
from app.schemas.auth import TokenResponse
from app.services.audit_service import AuditService

logger = logging.getLogger(__name__)

INVALID_CREDENTIALS = "Invalid email or password"
INVALID_REFRESH = "Invalid or expired refresh token"


class AuthService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.users = UserRepository(db)
        self.tokens = RefreshTokenRepository(db)
        self.audit = AuditService(db)

    def register(self, email: str, name: str, password: str) -> User:
        if self.users.get_by_email(email):
            raise ConflictError("Email is already registered")

        user = User(email=email, name=name, password_hash=hash_password(password))
        try:
            self.users.add(user)
            self.audit.record(user.id, "user.registered", "user", user.id)
            self.db.commit()
        except IntegrityError as exc:  # two simultaneous registrations
            self.db.rollback()
            raise ConflictError("Email is already registered") from exc

        logger.info("User registered: %s", user.id)
        return user

    def login(self, email: str, password: str) -> TokenResponse:
        user = self.users.get_by_email(email)
        if user is None:
            burn_password_check(password)
            raise UnauthorizedError(INVALID_CREDENTIALS)
        if not verify_password(password, user.password_hash):
            raise UnauthorizedError(INVALID_CREDENTIALS)

        self.audit.record(user.id, "user.logged_in", "user", user.id)
        logger.info("User logged in: %s", user.id)
        return self._issue_tokens(user)

    def refresh(self, raw_refresh_token: str) -> TokenResponse:
        record = self.tokens.get_by_hash(hash_refresh_token(raw_refresh_token))
        now = datetime.now(UTC)
        if record is None or record.revoked_at is not None or record.expires_at <= now:
            raise UnauthorizedError(INVALID_REFRESH)

        user = self.users.get_by_id(record.user_id)
        if user is None:
            raise UnauthorizedError(INVALID_REFRESH)

        record.revoked_at = now  # rotation: each refresh token works exactly once
        return self._issue_tokens(user)

    def logout(self, raw_refresh_token: str) -> None:
        """Idempotent: unknown or already-revoked tokens are silently ignored."""
        record = self.tokens.get_by_hash(hash_refresh_token(raw_refresh_token))
        if record is not None and record.revoked_at is None:
            record.revoked_at = datetime.now(UTC)
            self.audit.record(record.user_id, "user.logged_out", "user", record.user_id)
            self.db.commit()
            logger.info("User logged out: %s", record.user_id)

    def _issue_tokens(self, user: User) -> TokenResponse:
        settings = get_settings()
        raw, token_hash = generate_refresh_token()
        self.tokens.add(
            RefreshToken(
                user_id=user.id,
                token_hash=token_hash,
                expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days),
            )
        )
        self.db.commit()
        return TokenResponse(
            access_token=create_access_token(user.id),
            refresh_token=raw,
            expires_in=settings.access_token_expire_minutes * 60,
        )
