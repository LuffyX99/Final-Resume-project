import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.deps import get_current_admin
from app.schemas.admin import (
    AdminApplicationsListResponse,
    AdminCandidateUpdate,
    AdminJobItem,
    AdminJobsListResponse,
    AdminJobStatusUpdate,
    AdminJobUpdate,
    AdminLoginRequest,
    AdminLoginResponse,
    AdminMetricsResponse,
    AdminRecruiterCreate,
    AdminRecruiterUpdate,
    AdminResetPasswordRequest,
    AdminShortlistedListResponse,
    AdminUserItem,
    AdminUsersListResponse,
    JobTakedownRequest,
    UserStatusUpdate,
)
from app.security import create_admin_token
from app.services.admin_service import AdminService

router = APIRouter(prefix="/api/admin", tags=["admin"])


# --- Admin Authentication ---


@router.post("/login", response_model=AdminLoginResponse)
async def admin_login(body: AdminLoginRequest):
    """Authenticate platform administrator with fixed environment credentials."""
    ident = body.get_identifier()
    configured_id = (settings.admin_id or "").strip()
    configured_email = (settings.admin_email or "").strip()
    valid_ids = {configured_id.lower()}
    if configured_email:
        valid_ids.add(configured_email.lower())

    if (
        ident.lower() not in valid_ids
        or body.password != settings.admin_password
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin ID or password",
        )

    token, expires_in = create_admin_token(configured_id or ident)
    return AdminLoginResponse(
        access_token=token,
        token_type="bearer",
        expires_in=expires_in,
        admin={
            "id": configured_id or ident,
            "role": "admin",
            "full_name": settings.admin_full_name,
        },
    )


@router.get("/me")
async def get_admin_profile(admin: Any = Depends(get_current_admin)):
    """Retrieve currently authenticated admin identity."""
    return {
        "id": getattr(admin, "id", settings.admin_id),
        "role": "admin",
        "full_name": getattr(admin, "full_name", settings.admin_full_name),
    }


# --- Overview Metrics ---


@router.get("/metrics", response_model=AdminMetricsResponse)
async def get_admin_metrics(
    admin: Any = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get live platform totals and system metrics."""
    return await AdminService.get_metrics(db)


# --- Manage Candidates ---


@router.get("/candidates", response_model=AdminUsersListResponse)
async def list_admin_candidates(
    search: Optional[str] = Query(None, description="Search by name or email"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    admin: Any = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """List, search, and filter all registered candidates."""
    return await AdminService.list_users(
        db=db,
        search=search,
        role="candidate",
        is_active=is_active,
        page=page,
        page_size=limit,
    )


@router.get("/candidates/{candidate_id}", response_model=AdminUserItem)
async def get_candidate_detail(
    candidate_id: uuid.UUID,
    admin: Any = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get candidate profile and activity counts."""
    return await AdminService.get_user_detail(db=db, user_id=candidate_id)


@router.put("/candidates/{candidate_id}", response_model=AdminUserItem)
async def edit_candidate(
    candidate_id: uuid.UUID,
    payload: AdminCandidateUpdate,
    admin: Any = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Edit candidate personal profile details."""
    return await AdminService.update_candidate(
        db=db, candidate_id=candidate_id, payload=payload
    )


@router.patch("/candidates/{candidate_id}/status", response_model=AdminUserItem)
async def toggle_candidate_status(
    candidate_id: uuid.UUID,
    payload: UserStatusUpdate,
    admin: Any = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Activate or deactivate a candidate account."""
    return await AdminService.update_user_status(
        db=db,
        admin_user=admin,
        user_id=candidate_id,
        is_active=payload.is_active,
    )


@router.delete("/candidates/{candidate_id}")
async def delete_candidate(
    candidate_id: uuid.UUID,
    admin: Any = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete candidate and associated data."""
    return await AdminService.delete_candidate(db=db, candidate_id=candidate_id)


# --- Manage Recruiters ---


@router.get("/recruiters", response_model=AdminUsersListResponse)
async def list_admin_recruiters(
    search: Optional[str] = Query(None, description="Search by name, email, or company"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    admin: Any = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all recruiters with their IDs and company affiliations."""
    return await AdminService.list_users(
        db=db,
        search=search,
        role="recruiter",
        is_active=is_active,
        page=page,
        page_size=limit,
    )


@router.post(
    "/recruiters",
    response_model=AdminUserItem,
    status_code=status.HTTP_201_CREATED,
)
async def add_new_recruiter(
    payload: AdminRecruiterCreate,
    admin: Any = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin sets up a new recruiter with ID and password (securely hashed)."""
    return await AdminService.create_recruiter(db=db, payload=payload)


@router.get("/recruiters/{recruiter_id}", response_model=AdminUserItem)
async def get_recruiter_detail(
    recruiter_id: uuid.UUID,
    admin: Any = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get recruiter profile and job counts."""
    return await AdminService.get_user_detail(db=db, user_id=recruiter_id)


@router.put("/recruiters/{recruiter_id}", response_model=AdminUserItem)
async def edit_recruiter(
    recruiter_id: uuid.UUID,
    payload: AdminRecruiterUpdate,
    admin: Any = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Edit recruiter name, email, phone, and company affiliation."""
    return await AdminService.update_recruiter(
        db=db, recruiter_id=recruiter_id, payload=payload
    )


@router.post("/recruiters/{recruiter_id}/reset-password")
async def reset_recruiter_password(
    recruiter_id: uuid.UUID,
    payload: AdminResetPasswordRequest,
    admin: Any = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Reset a recruiter's password securely with Argon2id hashing."""
    return await AdminService.reset_recruiter_password(
        db=db, recruiter_id=recruiter_id, new_password=payload.new_password
    )


@router.patch("/recruiters/{recruiter_id}/status", response_model=AdminUserItem)
async def toggle_recruiter_status(
    recruiter_id: uuid.UUID,
    payload: UserStatusUpdate,
    admin: Any = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Activate or deactivate a recruiter account."""
    return await AdminService.update_user_status(
        db=db,
        admin_user=admin,
        user_id=recruiter_id,
        is_active=payload.is_active,
    )


@router.delete("/recruiters/{recruiter_id}")
async def delete_recruiter(
    recruiter_id: uuid.UUID,
    admin: Any = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete recruiter and their posted jobs/applications."""
    return await AdminService.delete_recruiter(db=db, recruiter_id=recruiter_id)


# --- Legacy / Combined User Management ---


@router.get("/users", response_model=AdminUsersListResponse)
async def list_admin_users(
    search: Optional[str] = Query(None, description="Search by name or email"),
    role: Optional[str] = Query(None, description="Filter by role: candidate, recruiter, admin"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    admin: Any = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """List, search, and filter all registered users on the platform."""
    return await AdminService.list_users(
        db=db,
        search=search,
        role=role,
        is_active=is_active,
        page=page,
        page_size=limit,
    )


@router.get("/users/{user_id}", response_model=AdminUserItem)
async def get_user_detail(
    user_id: uuid.UUID,
    admin: Any = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """View detailed information and activity counts for a user."""
    return await AdminService.get_user_detail(db=db, user_id=user_id)


@router.patch("/users/{user_id}/status", response_model=AdminUserItem)
async def update_user_status(
    user_id: uuid.UUID,
    payload: UserStatusUpdate,
    admin: Any = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Activate or deactivate a user account."""
    return await AdminService.update_user_status(
        db=db,
        admin_user=admin,
        user_id=user_id,
        is_active=payload.is_active,
    )


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: uuid.UUID,
    admin: Any = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete candidate or recruiter account by ID."""
    target = await AdminService.get_user_detail(db, user_id)
    if target.role == "recruiter":
        return await AdminService.delete_recruiter(db=db, recruiter_id=user_id)
    else:
        return await AdminService.delete_candidate(db=db, candidate_id=user_id)


# --- Manage Job Posts ---


@router.get("/jobs", response_model=AdminJobsListResponse)
async def list_admin_jobs(
    search: Optional[str] = Query(None, description="Search by job title or company"),
    status: Optional[str] = Query(None, description="Filter by status (open/closed)"),
    page: int = Query(1, ge=0),
    limit: int = Query(20, ge=1, le=100),
    admin: Any = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Oversee all jobs posted across the platform."""
    safe_page = max(1, page)
    return await AdminService.list_jobs(
        db=db,
        search=search,
        status=status,
        page=safe_page,
        page_size=limit,
    )


@router.put("/jobs/{job_id}", response_model=AdminJobItem)
async def edit_admin_job(
    job_id: uuid.UUID,
    payload: AdminJobUpdate,
    admin: Any = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Edit job posting specifications."""
    return await AdminService.update_job(db=db, job_id=job_id, payload=payload)


@router.patch("/jobs/{job_id}/status", response_model=AdminJobItem)
async def toggle_job_status(
    job_id: uuid.UUID,
    payload: AdminJobStatusUpdate,
    admin: Any = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Activate or close a job posting."""
    return await AdminService.update_job_status(
        db=db, job_id=job_id, status=payload.status
    )


@router.delete("/jobs/{job_id}")
async def delete_admin_job(
    job_id: uuid.UUID,
    admin: Any = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete a job posting and associated matches."""
    return await AdminService.delete_job(db=db, job_id=job_id)


@router.post("/jobs/{job_id}/takedown", response_model=AdminJobItem)
async def takedown_job(
    job_id: uuid.UUID,
    payload: JobTakedownRequest,
    admin: Any = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Moderate and take down an inappropriate job listing with a reason."""
    return await AdminService.takedown_job(
        db=db,
        job_id=job_id,
        reason=payload.reason,
    )


# --- Shortlisted Candidates & Applications ---


@router.get("/shortlisted", response_model=AdminShortlistedListResponse)
async def list_admin_shortlisted(
    search: Optional[str] = Query(None, description="Search by candidate, job, or recruiter"),
    job_id: Optional[str] = Query(None, description="Filter by job ID"),
    recruiter_id: Optional[str] = Query(None, description="Filter by recruiter ID"),
    page: int = Query(1, ge=0),
    limit: int = Query(20, ge=1, le=100),
    admin: Any = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """View all shortlisted candidates with job title, recruiter, and status."""
    parsed_job_id: Optional[uuid.UUID] = None
    if job_id and str(job_id).strip():
        try:
            parsed_job_id = uuid.UUID(str(job_id).strip())
        except (ValueError, TypeError):
            pass

    parsed_recruiter_id: Optional[uuid.UUID] = None
    if recruiter_id and str(recruiter_id).strip():
        try:
            parsed_recruiter_id = uuid.UUID(str(recruiter_id).strip())
        except (ValueError, TypeError):
            pass

    safe_page = max(1, page)
    return await AdminService.list_shortlisted(
        db=db,
        search=search,
        job_id=parsed_job_id,
        recruiter_id=parsed_recruiter_id,
        page=safe_page,
        page_size=limit,
    )


@router.get("/applications", response_model=AdminApplicationsListResponse)
async def list_admin_applications(
    search: Optional[str] = Query(None, description="Search by candidate or job"),
    job_id: Optional[uuid.UUID] = Query(None, description="Filter by job ID"),
    status: Optional[str] = Query(None, description="Filter by application status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    admin: Any = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Oversee all candidate applications and match scores across the platform."""
    return await AdminService.list_applications(
        db=db,
        search=search,
        job_id=job_id,
        status=status,
        page=page,
        page_size=limit,
    )
