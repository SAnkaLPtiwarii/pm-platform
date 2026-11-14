import logging
import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError
from app.models.enums import ProjectStatus
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.user import User
from app.policies import authorize, can
from app.repositories.project_repository import ProjectCounts, ProjectRepository
from app.repositories.user_repository import UserRepository
from app.schemas.common import Page, PageParams
from app.schemas.project import (
    MemberResponse,
    ProjectCreate,
    ProjectPermissions,
    ProjectResponse,
    ProjectUpdate,
)
from app.services.audit_service import AuditService

logger = logging.getLogger(__name__)

PROJECT_NOT_FOUND = "Project not found"


class ProjectService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.projects = ProjectRepository(db)
        self.users = UserRepository(db)
        self.audit = AuditService(db)

    # --- projects ----------------------------------------------------------------

    def create(self, user: User, payload: ProjectCreate) -> ProjectResponse:
        authorize(user, "project:create", None)
        project = Project(name=payload.name, description=payload.description, owner_id=user.id)
        # The owner is also a member, so "my projects" is a single membership lookup.
        project.members.append(ProjectMember(user_id=user.id))
        self.projects.add(project)
        self.audit.record(
            user.id, "project.created", "project", project.id, project.id, {"name": project.name}
        )
        self.db.commit()
        logger.info("Project created: %s by %s", project.id, user.id)
        return self._response(user, project, ProjectCounts(members=1))

    def list_projects(
        self,
        user: User,
        params: PageParams,
        *,
        status: ProjectStatus | None,
        search: str | None,
    ) -> Page[ProjectResponse]:
        # Visibility ("only members can view") is applied as a SQL filter here:
        # calling authorize() per row would mean loading every project first.
        projects, total = self.projects.list_for_user(
            user.id,
            status=status,
            search=(search or "").strip() or None,
            offset=params.offset,
            limit=params.page_size,
        )
        counts = self.projects.counts_for([project.id for project in projects])
        return Page[ProjectResponse](
            items=[
                self._response(user, project, counts.get(project.id, ProjectCounts()))
                for project in projects
            ],
            total=total,
            page=params.page,
            page_size=params.page_size,
        )

    def get(self, user: User, project_id: uuid.UUID) -> ProjectResponse:
        project = self._get_visible(user, project_id)
        return self._response(user, project, self._counts(project.id))

    def update(self, user: User, project_id: uuid.UUID, payload: ProjectUpdate) -> ProjectResponse:
        project = self._get_visible(user, project_id)
        authorize(user, "project:update", project)
        for field_name in payload.model_fields_set:
            setattr(project, field_name, getattr(payload, field_name))
        self.audit.record(
            user.id,
            "project.updated",
            "project",
            project.id,
            project.id,
            {"fields": sorted(payload.model_fields_set)},
        )
        self.db.commit()
        logger.info("Project updated: %s by %s", project.id, user.id)
        return self._response(user, project, self._counts(project.id))

    def delete(self, user: User, project_id: uuid.UUID) -> None:
        project = self._get_visible(user, project_id)
        authorize(user, "project:delete", project)
        self.audit.record(
            user.id,
            "project.deleted",
            "project",
            project.id,
            project.id,
            {"name": project.name},
        )
        self.projects.delete(project)  # tasks and memberships are removed by cascade
        self.db.commit()
        logger.info("Project deleted: %s by %s", project_id, user.id)

    # --- members -----------------------------------------------------------------

    def list_members(self, user: User, project_id: uuid.UUID) -> list[MemberResponse]:
        project = self._get_visible(user, project_id)
        return [
            MemberResponse(
                user_id=member_user.id,
                name=member_user.name,
                email=member_user.email,
                is_owner=member_user.id == project.owner_id,
                joined_at=member.joined_at,
            )
            for member, member_user in self.projects.list_members(project.id)
        ]

    def add_member(self, user: User, project_id: uuid.UUID, email: str) -> MemberResponse:
        project = self._get_visible(user, project_id)
        authorize(user, "project:manage_members", project)

        target = self.users.get_by_email(email)
        if target is None:
            raise NotFoundError("No registered user with that email")
        if self.projects.get_member(project.id, target.id) is not None:
            raise ConflictError("User is already a member of this project")

        try:
            member = self.projects.add_member(project.id, target.id)
            self.audit.record(
                user.id,
                "member.added",
                "project",
                project.id,
                project.id,
                {"user_id": str(target.id)},
            )
            self.db.commit()
        except IntegrityError as exc:  # two simultaneous adds
            self.db.rollback()
            raise ConflictError("User is already a member of this project") from exc

        logger.info("Member %s added to project %s by %s", target.id, project.id, user.id)
        return MemberResponse(
            user_id=target.id,
            name=target.name,
            email=target.email,
            is_owner=target.id == project.owner_id,
            joined_at=member.joined_at,
        )

    def remove_member(self, user: User, project_id: uuid.UUID, member_user_id: uuid.UUID) -> None:
        project = self._get_visible(user, project_id)
        authorize(user, "project:manage_members", project)

        if member_user_id == project.owner_id:
            raise ConflictError("The project owner cannot be removed")
        member = self.projects.get_member(project.id, member_user_id)
        if member is None:
            raise NotFoundError("Member not found")

        unassigned = self.projects.unassign_tasks(project.id, member_user_id)
        self.projects.remove_member(member)
        self.db.commit()
        logger.info(
            "Member %s removed from project %s by %s (%d tasks unassigned)",
            member_user_id,
            project.id,
            user.id,
            unassigned,
        )

    # --- helpers -----------------------------------------------------------------
    def activity(self, user: User, project_id: uuid.UUID, params: PageParams):
        """The project's activity timeline, newest first (visible to members only)."""
        project = self._get_visible(user, project_id)
        return self.audit.list_project_activity(project.id, params)

    def _get_visible(self, user: User, project_id: uuid.UUID) -> Project:
        """Load a project the user may see. Missing and hidden both look like 404."""
        project = self.projects.get(project_id)
        if project is None:
            raise NotFoundError(PROJECT_NOT_FOUND)
        authorize(
            user,
            "project:view",
            project,
            on_deny=NotFoundError,
            message=PROJECT_NOT_FOUND,
        )
        return project

    def _counts(self, project_id: uuid.UUID) -> ProjectCounts:
        return self.projects.counts_for([project_id]).get(project_id, ProjectCounts())

    def _response(self, user: User, project: Project, counts: ProjectCounts) -> ProjectResponse:
        return ProjectResponse(
            id=project.id,
            name=project.name,
            description=project.description,
            status=project.status,
            owner_id=project.owner_id,
            member_count=counts.members,
            task_count=counts.tasks,
            completed_task_count=counts.completed_tasks,
            permissions=ProjectPermissions(
                update=can(user, "project:update", project),
                delete=can(user, "project:delete", project),
                manage_members=can(user, "project:manage_members", project),
            ),
            created_at=project.created_at,
            updated_at=project.updated_at,
        )
