import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.enums import TaskPriority, TaskStatus
from app.models.project import Project
from app.models.task import Task
from app.repositories.utils import like_pattern


class TaskRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, task_id: uuid.UUID) -> Task | None:
        # Project and its members are loaded because policies inspect them.
        return self.db.scalar(
            select(Task)
            .where(Task.id == task_id)
            .options(
                selectinload(Task.project).selectinload(Project.members),
                joinedload(Task.assignee),
                joinedload(Task.created_by),
            )
            .execution_options(populate_existing=True)
        )

    def add(self, task: Task) -> Task:
        self.db.add(task)
        self.db.flush()
        return task

    def delete(self, task: Task) -> None:
        self.db.delete(task)

    def list_for_project(
        self,
        project_id: uuid.UUID,
        *,
        search: str | None,
        status: TaskStatus | None,
        priority: TaskPriority | None,
        assignee_id: uuid.UUID | None,
        offset: int,
        limit: int,
    ) -> tuple[list[Task], int]:
        conditions = [Task.project_id == project_id]
        if status is not None:
            conditions.append(Task.status == status)
        if priority is not None:
            conditions.append(Task.priority == priority)
        if assignee_id is not None:
            conditions.append(Task.assignee_id == assignee_id)
        if search:
            pattern = like_pattern(search)
            conditions.append(
                or_(
                    Task.title.ilike(pattern, escape="\\"),
                    Task.description.ilike(pattern, escape="\\"),
                )
            )

        total = self.db.scalar(select(func.count()).select_from(Task).where(*conditions)) or 0
        items = self.db.scalars(
            select(Task)
            .where(*conditions)
            .options(
                selectinload(Task.project),
                joinedload(Task.assignee),
                joinedload(Task.created_by),
            )
            .order_by(Task.created_at.desc(), Task.id)
            .offset(offset)
            .limit(limit)
        ).all()
        return list(items), total
