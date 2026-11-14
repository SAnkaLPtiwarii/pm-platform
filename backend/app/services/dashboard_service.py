from sqlalchemy.orm import Session

from app.models.user import User
from app.repositories.project_repository import ProjectRepository
from app.schemas.dashboard import DashboardStats


class DashboardService:
    def __init__(self, db: Session) -> None:
        self.projects = ProjectRepository(db)

    def stats(self, user: User) -> DashboardStats:
        """Statistics over the projects the user is a member of."""
        counts = self.projects.dashboard_counts(user.id)
        return DashboardStats(
            total_projects=counts.total_projects,
            active_projects=counts.active_projects,
            total_tasks=counts.total_tasks,
            completed_tasks=counts.completed_tasks,
            # pending = everything that is not completed (Todo + In Progress)
            pending_tasks=counts.total_tasks - counts.completed_tasks,
        )
