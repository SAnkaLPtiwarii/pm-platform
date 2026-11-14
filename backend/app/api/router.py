from fastapi import APIRouter

from app.api.routers import auth, dashboard, projects, tasks

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(projects.router)
api_router.include_router(tasks.router)
api_router.include_router(dashboard.router)
