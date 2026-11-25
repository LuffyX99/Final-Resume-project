import uuid
from typing import Any, Union

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import Job, Resume, User
from app.security import decode_access_token

_bearer = HTTPBearer(auto_error=False)


class AdminPrincipal:
    def __init__(self, admin_id: str):
        self.id = admin_id
        self.role = "admin"
        self.full_name = getattr(settings, "admin_full_name", "Platform Administrator")
        self.email = getattr(settings, "admin_email", "admin@resumematch.ai")
        self.is_active = True


def _unauthorized(detail: str = "Not authenticated") -> HTTPException:
    return HTTPException(
        status_code=401, detail=detail, headers={"WWW-Authenticate": "Bearer"}
    )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise _unauthorized()

    try:
        payload = decode_access_token(credentials.credentials)
        # Block admin tokens from accessing user endpoints
        if payload.get("is_admin") is True or str(payload.get("sub", "")).startswith("admin:"):
            raise _unauthorized("Invalid token for user endpoints")
        user_id = uuid.UUID(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError):
        raise _unauthorized("Invalid or expired token")

    user = await db.get(User, user_id)
    if user is None:
        raise _unauthorized()
    if not user.is_active:
        raise HTTPException(
            status_code=403, detail="This account has been deactivated"
        )
    return user


async def get_current_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> Union[AdminPrincipal, User]:
    if credentials is None:
        raise _unauthorized("Admin authentication required")

    try:
        payload = decode_access_token(credentials.credentials)
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError):
        raise _unauthorized("Invalid or expired admin token")

    if payload.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to access the admin portal",
        )

    sub = str(payload.get("sub", ""))
    if sub.startswith("admin:") or sub == "admin" or payload.get("is_admin") is True:
        admin_id = payload.get("admin_id") or sub.removeprefix("admin:")
        return AdminPrincipal(admin_id=admin_id)

    # Legacy database-backed admin compatibility
    try:
        user_id = uuid.UUID(sub)
        user = await db.get(User, user_id)
        if user and user.role == "admin" and user.is_active:
            return user
    except Exception:
        pass

    return AdminPrincipal(admin_id=payload.get("admin_id", "admin"))


def require_role(*roles: str):
    async def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to perform this action",
            )
        return user

    return dependency


def ensure_job_access(job: Job, user: User) -> None:
    if user.role == "admin" or job.recruiter_id == user.id:
        return
    raise HTTPException(
        status_code=403, detail="You do not have permission to perform this action"
    )


def ensure_resume_access(resume: Resume, user: User) -> None:
    if user.role == "admin" or resume.candidate_id == user.id:
        return
    # Unclaimed documents (legacy rows, recruiter-side uploads) are recruiter-managed.
    if user.role == "recruiter" and resume.candidate_id is None:
        return
    raise HTTPException(
        status_code=403, detail="You do not have permission to perform this action"
    )
