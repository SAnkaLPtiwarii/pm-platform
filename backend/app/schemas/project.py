import uuid
from datetime import datetime
from typing import Annotated, Self

from pydantic import BaseModel, EmailStr, StringConstraints, field_validator, model_validator

from app.models.enums import ProjectStatus

ProjectName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=150)]
ProjectDescription = Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)]


class ProjectCreate(BaseModel):
    name: ProjectName
    description: ProjectDescription | None = None


class ProjectUpdate(BaseModel):
    """Partial update: only the fields that are sent are changed."""

    name: ProjectName | None = None
    description: ProjectDescription | None = None
    status: ProjectStatus | None = None

    @model_validator(mode="after")
    def check_fields(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        for field_name in ("name", "status"):
            if field_name in self.model_fields_set and getattr(self, field_name) is None:
                raise ValueError(f"{field_name} cannot be null")
        return self


class ProjectPermissions(BaseModel):
    update: bool
    delete: bool
    manage_members: bool


class ProjectResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    status: ProjectStatus
    owner_id: uuid.UUID
    member_count: int
    task_count: int
    completed_task_count: int
    permissions: ProjectPermissions
    created_at: datetime
    updated_at: datetime


class MemberAdd(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.lower()


class MemberResponse(BaseModel):
    user_id: uuid.UUID
    name: str
    email: str
    is_owner: bool
    joined_at: datetime
