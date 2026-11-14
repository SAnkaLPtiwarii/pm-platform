import uuid
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession, Pagination
from app.models.enums import ProjectStatus
from app.schemas.common import Page
from app.schemas.project import (
    MemberAdd,
    MemberResponse,
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
)
from app.services.project_service import ProjectService

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("", response_model=ProjectResponse, status_code=201)
def create_project(payload: ProjectCreate, db: DbSession, current_user: CurrentUser):
    return ProjectService(db).create(current_user, payload)


@router.get("", response_model=Page[ProjectResponse])
def list_projects(
    db: DbSession,
    current_user: CurrentUser,
    pagination: Pagination,
    status: ProjectStatus | None = None,
    search: Annotated[
        str | None, Query(max_length=100, description="Match on project name")
    ] = None,
):
    return ProjectService(db).list_projects(current_user, pagination, status=status, search=search)


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    return ProjectService(db).get(current_user, project_id)


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: uuid.UUID, payload: ProjectUpdate, db: DbSession, current_user: CurrentUser
):
    return ProjectService(db).update(current_user, project_id, payload)


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: uuid.UUID, db: DbSession, current_user: CurrentUser) -> None:
    ProjectService(db).delete(current_user, project_id)


@router.get("/{project_id}/members", response_model=list[MemberResponse])
def list_members(project_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    return ProjectService(db).list_members(current_user, project_id)


@router.post("/{project_id}/members", response_model=MemberResponse, status_code=201)
def add_member(project_id: uuid.UUID, payload: MemberAdd, db: DbSession, current_user: CurrentUser):
    return ProjectService(db).add_member(current_user, project_id, payload.email)


@router.delete("/{project_id}/members/{user_id}", status_code=204)
def remove_member(
    project_id: uuid.UUID, user_id: uuid.UUID, db: DbSession, current_user: CurrentUser
) -> None:
    ProjectService(db).remove_member(current_user, project_id, user_id)
