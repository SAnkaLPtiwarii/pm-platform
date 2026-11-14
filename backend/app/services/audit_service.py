import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.activity import ActivityResponse
from app.schemas.common import Page, PageParams
from app.schemas.task import UserSummary


class AuditService:
    """Append-only audit trail.

    `record` only adds the entry to the caller's session: it is committed (or rolled
    back) together with the action it describes.
    """

    def __init__(self, db: Session) -> None:
        self.db = db

    def record(
        self,
        actor_id: uuid.UUID | None,
        action: str,
        resource_type: str,
        resource_id: uuid.UUID | None = None,
        project_id: uuid.UUID | None = None,
        detail: dict[str, Any] | None = None,
    ) -> None:
        self.db.add(
            AuditLog(
                actor_id=actor_id,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                project_id=project_id,
                detail=detail,
            )
        )

    def list_project_activity(
        self, project_id: uuid.UUID, params: PageParams
    ) -> Page[ActivityResponse]:
        total = (
            self.db.scalar(
                select(func.count()).select_from(AuditLog).where(AuditLog.project_id == project_id)
            )
            or 0
        )
        rows = self.db.execute(
            select(AuditLog, User)
            .outerjoin(User, User.id == AuditLog.actor_id)
            .where(AuditLog.project_id == project_id)
            .order_by(AuditLog.created_at.desc(), AuditLog.id)
            .offset(params.offset)
            .limit(params.page_size)
        ).all()
        items = [
            ActivityResponse(
                id=entry.id,
                action=entry.action,
                actor=UserSummary.model_validate(actor) if actor else None,
                resource_type=entry.resource_type,
                resource_id=entry.resource_id,
                detail=entry.detail,
                created_at=entry.created_at,
            )
            for entry, actor in rows
        ]
        return Page[ActivityResponse](
            items=items, total=total, page=params.page, page_size=params.page_size
        )
