import uuid
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession, Pagination
from app.models.enums import TaskPriority, TaskStatus
from app.schemas.common import Page
from app.schemas.task import TaskCreate, TaskResponse, TaskUpdate
from app.services.task_service import TaskService

router = APIRouter(tags=["tasks"])


@router.post("/projects/{project_id}/tasks", response_model=TaskResponse, status_code=201)
def create_task(
    project_id: uuid.UUID, payload: TaskCreate, db: DbSession, current_user: CurrentUser
):
    return TaskService(db).create(current_user, project_id, payload)


@router.get("/projects/{project_id}/tasks", response_model=Page[TaskResponse])
def list_tasks(
    project_id: uuid.UUID,
    db: DbSession,
    current_user: CurrentUser,
    pagination: Pagination,
    search: Annotated[str | None, Query(max_length=100, description="Title or description")] = None,
    status: TaskStatus | None = None,
    priority: TaskPriority | None = None,
    assignee_id: uuid.UUID | None = None,
):
    return TaskService(db).list_tasks(
        current_user,
        project_id,
        pagination,
        search=search,
        status=status,
        priority=priority,
        assignee_id=assignee_id,
    )


@router.get("/tasks/{task_id}", response_model=TaskResponse)
def get_task(task_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    return TaskService(db).get(current_user, task_id)


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
def update_task(task_id: uuid.UUID, payload: TaskUpdate, db: DbSession, current_user: CurrentUser):
    return TaskService(db).update(current_user, task_id, payload)


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: uuid.UUID, db: DbSession, current_user: CurrentUser) -> None:
    TaskService(db).delete(current_user, task_id)
