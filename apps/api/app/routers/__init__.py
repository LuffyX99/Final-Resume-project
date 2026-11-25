from app.routers.admin import router as admin_router
from app.routers.applications import router as applications_router
from app.routers.auth import router as auth_router
from app.routers.events import router as events_router
from app.routers.jobs import router as jobs_router
from app.routers.matches import router as matches_router
from app.routers.notifications import router as notifications_router
from app.routers.resumes import router as resumes_router
from app.routers.support import router as support_router

__all__ = [
    "admin_router",
    "applications_router",
    "auth_router",
    "events_router",
    "jobs_router",
    "matches_router",
    "notifications_router",
    "resumes_router",
    "support_router",
]
