import uuid
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, selectinload

from app.models.enums import ProjectStatus, TaskStatus
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.task import Task
from app.models.user import User
from app.repositories.utils import like_pattern


@dataclass(frozen=True)
class ProjectCounts:
    members: int = 0
    tasks: int = 0
    completed_tasks: int = 0


@dataclass(frozen=True)
class DashboardCounts:
    total_projects: int
    active_projects: int
    total_tasks: int
    completed_tasks: int


class ProjectRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, project_id: uuid.UUID) -> Project | None:
        # Members are loaded eagerly because policies may inspect them.
        return self.db.scalar(
            select(Project).where(Project.id == project_id).options(selectinload(Project.members))
        )

    def add(self, project: Project) -> Project:
        self.db.add(project)
        self.db.flush()
        return project

    def delete(self, project: Project) -> None:
        self.db.delete(project)

    def list_for_user(
        self,
        user_id: uuid.UUID,
        *,
        status: ProjectStatus | None,
        search: str | None,
        offset: int,
        limit: int,
    ) -> tuple[list[Project], int]:
        """Projects the user is a member of. Visibility is enforced here, in SQL."""
        member_of = select(ProjectMember.project_id).where(ProjectMember.user_id == user_id)
        conditions = [Project.id.in_(member_of)]
        if status is not None:
            conditions.append(Project.status == status)
        if search:
            conditions.append(Project.name.ilike(like_pattern(search), escape="\\"))

        total = self.db.scalar(select(func.count()).select_from(Project).where(*conditions)) or 0
        items = self.db.scalars(
            select(Project)
            .where(*conditions)
            .order_by(Project.created_at.desc(), Project.id)
            .offset(offset)
            .limit(limit)
        ).all()
        return list(items), total

    def counts_for(self, project_ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, ProjectCounts]:
        """Member and task counts for many projects in two grouped queries."""
        if not project_ids:
            return {}
        member_rows = self.db.execute(
            select(ProjectMember.project_id, func.count())
            .where(ProjectMember.project_id.in_(project_ids))
            .group_by(ProjectMember.project_id)
        ).all()
        task_rows = self.db.execute(
            select(
                Task.project_id,
                func.count(),
                func.count().filter(Task.status == TaskStatus.COMPLETED),
            )
            .where(Task.project_id.in_(project_ids))
            .group_by(Task.project_id)
        ).all()

        members = {project_id: count for project_id, count in member_rows}
        tasks = {project_id: (total, done) for project_id, total, done in task_rows}
        return {
            project_id: ProjectCounts(
                members=members.get(project_id, 0),
                tasks=tasks.get(project_id, (0, 0))[0],
                completed_tasks=tasks.get(project_id, (0, 0))[1],
            )
            for project_id in project_ids
        }

    # --- members -----------------------------------------------------------------

    def list_members(self, project_id: uuid.UUID) -> list[tuple[ProjectMember, User]]:
        rows = self.db.execute(
            select(ProjectMember, User)
            .join(User, User.id == ProjectMember.user_id)
            .where(ProjectMember.project_id == project_id)
            .order_by(ProjectMember.joined_at, User.name)
        ).all()
        return [(member, user) for member, user in rows]

    def get_member(self, project_id: uuid.UUID, user_id: uuid.UUID) -> ProjectMember | None:
        return self.db.get(ProjectMember, (project_id, user_id))

    def add_member(self, project_id: uuid.UUID, user_id: uuid.UUID) -> ProjectMember:
        member = ProjectMember(project_id=project_id, user_id=user_id)
        self.db.add(member)
        self.db.flush()
        return member

    def remove_member(self, member: ProjectMember) -> None:
        self.db.delete(member)

    def unassign_tasks(self, project_id: uuid.UUID, user_id: uuid.UUID) -> int:
        """Clear the assignee on a project's tasks when that user leaves the project."""
        result = self.db.execute(
            update(Task)
            .where(Task.project_id == project_id, Task.assignee_id == user_id)
            .values(assignee_id=None)
        )
        return result.rowcount or 0

    # --- dashboard ---------------------------------------------------------------

    def dashboard_counts(self, user_id: uuid.UUID) -> DashboardCounts:
        member_of = select(ProjectMember.project_id).where(ProjectMember.user_id == user_id)
        total_projects, active_projects = self.db.execute(
            select(
                func.count(),
                func.count().filter(Project.status == ProjectStatus.ACTIVE),
            )
            .select_from(Project)
            .where(Project.id.in_(member_of))
        ).one()
        total_tasks, completed_tasks = self.db.execute(
            select(
                func.count(),
                func.count().filter(Task.status == TaskStatus.COMPLETED),
            )
            .select_from(Task)
            .where(Task.project_id.in_(member_of))
        ).one()
        return DashboardCounts(total_projects, active_projects, total_tasks, completed_tasks)
