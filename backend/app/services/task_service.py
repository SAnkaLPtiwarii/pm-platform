import logging
import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationFailedError
from app.models.enums import TaskPriority, TaskStatus
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.policies import authorize, can
from app.repositories.project_repository import ProjectRepository
from app.repositories.task_repository import TaskRepository
from app.schemas.common import Page, PageParams
from app.schemas.task import (
    TaskCreate,
    TaskPermissions,
    TaskResponse,
    TaskUpdate,
    UserSummary,
)

logger = logging.getLogger(__name__)

PROJECT_NOT_FOUND = "Project not found"
TASK_NOT_FOUND = "Task not found"


class TaskService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.tasks = TaskRepository(db)
        self.projects = ProjectRepository(db)

    def create(self, user: User, project_id: uuid.UUID, payload: TaskCreate) -> TaskResponse:
        project = self._get_visible_project(user, project_id)
        authorize(user, "task:create", project)
        self._validate_assignee(project, payload.assignee_id)

        task = Task(
            project_id=project.id,
            title=payload.title,
            description=payload.description,
            status=TaskStatus.TODO,  # tasks always start as Todo
            priority=payload.priority,
            assignee_id=payload.assignee_id,
            due_date=payload.due_date,
            created_by_id=user.id,
        )
        self.tasks.add(task)
        self.db.commit()
        logger.info("Task created: %s in project %s by %s", task.id, project.id, user.id)
        return self._response(user, self._reload(task.id))

    def list_tasks(
        self,
        user: User,
        project_id: uuid.UUID,
        params: PageParams,
        *,
        search: str | None,
        status: TaskStatus | None,
        priority: TaskPriority | None,
        assignee_id: uuid.UUID | None,
    ) -> Page[TaskResponse]:
        project = self._get_visible_project(user, project_id)
        authorize(user, "task:view", project)
        tasks, total = self.tasks.list_for_project(
            project.id,
            search=(search or "").strip() or None,
            status=status,
            priority=priority,
            assignee_id=assignee_id,
            offset=params.offset,
            limit=params.page_size,
        )
        return Page[TaskResponse](
            items=[self._response(user, task) for task in tasks],
            total=total,
            page=params.page,
            page_size=params.page_size,
        )

    def get(self, user: User, task_id: uuid.UUID) -> TaskResponse:
        return self._response(user, self._get_visible(user, task_id))

    def update(self, user: User, task_id: uuid.UUID, payload: TaskUpdate) -> TaskResponse:
        task = self._get_visible(user, task_id)
        changes = {name: getattr(payload, name) for name in payload.model_fields_set}

        authorize(user, "task:update", task, changes=changes)
        if "assignee_id" in changes:
            self._validate_assignee(task.project, changes["assignee_id"])

        # The completion policy is checked against the state the task WOULD have
        # after this change (so "assign + fill fields + complete" works in one call).
        if changes.get("status", task.status) == TaskStatus.COMPLETED:
            authorize(user, "task:complete", task, changes=changes)

        for name, value in changes.items():
            setattr(task, name, value)
        self.db.commit()
        logger.info("Task updated: %s by %s fields=%s", task.id, user.id, sorted(changes))
        return self._response(user, self._reload(task.id))

    def delete(self, user: User, task_id: uuid.UUID) -> None:
        task = self._get_visible(user, task_id)
        authorize(user, "task:delete", task)
        self.tasks.delete(task)
        self.db.commit()
        logger.info("Task deleted: %s by %s", task_id, user.id)

    # --- helpers -----------------------------------------------------------------

    def _get_visible_project(self, user: User, project_id: uuid.UUID) -> Project:
        project = self.projects.get(project_id)
        if project is None:
            raise NotFoundError(PROJECT_NOT_FOUND)
        authorize(user, "project:view", project, on_deny=NotFoundError, message=PROJECT_NOT_FOUND)
        return project

    def _get_visible(self, user: User, task_id: uuid.UUID) -> Task:
        """Load a task the user may see. Missing and hidden both look like 404."""
        task = self.tasks.get(task_id)
        if task is None:
            raise NotFoundError(TASK_NOT_FOUND)
        authorize(user, "task:view", task, on_deny=NotFoundError, message=TASK_NOT_FOUND)
        return task

    def _reload(self, task_id: uuid.UUID) -> Task:
        task = self.tasks.get(task_id)
        if task is None:  # cannot happen right after a successful commit
            raise NotFoundError(TASK_NOT_FOUND)
        return task

    @staticmethod
    def _validate_assignee(project: Project, assignee_id: uuid.UUID | None) -> None:
        """Business validation (not authorization): assignees must be project members."""
        if assignee_id is None:
            return
        if not any(member.user_id == assignee_id for member in project.members):
            raise ValidationFailedError(
                "Assignee must be a member of the project",
                details=[
                    {"field": "assignee_id", "message": "User is not a member of this project"}
                ],
            )

    @staticmethod
    def _due_date(task: Task) -> date | None:
        return task.due_date

    def _response(self, user: User, task: Task) -> TaskResponse:
        can_update = can(user, "task:update", task)
        return TaskResponse(
            id=task.id,
            project_id=task.project_id,
            title=task.title,
            description=task.description,
            status=task.status,
            priority=task.priority,
            assignee=UserSummary.model_validate(task.assignee) if task.assignee else None,
            created_by=UserSummary.model_validate(task.created_by),
            due_date=self._due_date(task),
            permissions=TaskPermissions(
                update=can_update,
                delete=can(user, "task:delete", task),
                complete=can_update and can(user, "task:complete", task),
            ),
            created_at=task.created_at,
            updated_at=task.updated_at,
        )
