import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.schemas.task import UserSummary


class ActivityResponse(BaseModel):
    id: uuid.UUID
    action: str
    actor: UserSummary | None
    resource_type: str
    resource_id: uuid.UUID | None
    detail: dict[str, Any] | None
    created_at: datetime
