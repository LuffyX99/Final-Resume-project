import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_admin, get_support_actor
from app.models import User
from app.ratelimit import limiter
from app.schemas.support import (
    SupportMessageCreate,
    SupportMessageResponse,
    SupportThreadCreate,
    SupportThreadListResponse,
    SupportThreadResponse,
    SupportThreadStatusUpdate,
)
from app.services.support_service import SupportService

router = APIRouter(prefix="/api/support", tags=["support"])


@router.post("/threads", response_model=SupportThreadResponse, status_code=201)
@limiter.limit("10/minute")
async def create_support_thread(
    request: Request,
    payload: SupportThreadCreate,
    user: User = Depends(get_support_actor),
    db: AsyncSession = Depends(get_db),
):
    """Raise a new support ticket / query to the admin."""
    return await SupportService.create_thread(
        db=db,
        user=user,
        subject=payload.subject,
        category=payload.category,
        message=payload.message,
    )


@router.get("/threads", response_model=SupportThreadListResponse)
async def list_support_threads(
    status: Optional[str] = Query(None, description="Filter by status (open/resolved)"),
    search: Optional[str] = Query(None, description="Search subject or user"),
    user: User = Depends(get_support_actor),
    db: AsyncSession = Depends(get_db),
):
    """List support threads. Candidates/recruiters see only their own threads; admins see all platform threads."""
    return await SupportService.list_threads(
        db=db,
        user=user,
        status=status,
        search=search,
    )


@router.get("/threads/{thread_id}", response_model=SupportThreadResponse)
async def get_support_thread(
    thread_id: uuid.UUID,
    user: User = Depends(get_support_actor),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve support thread details and conversation message history."""
    return await SupportService.get_thread(
        db=db,
        user=user,
        thread_id=thread_id,
    )


@router.post("/threads/{thread_id}/messages", response_model=SupportMessageResponse, status_code=201)
@limiter.limit("30/minute")
async def post_thread_message(
    request: Request,
    thread_id: uuid.UUID,
    payload: SupportMessageCreate,
    user: User = Depends(get_support_actor),
    db: AsyncSession = Depends(get_db),
):
    """Send a reply into a support thread."""
    return await SupportService.add_message(
        db=db,
        user=user,
        thread_id=thread_id,
        content=payload.content,
    )


@router.patch("/threads/{thread_id}/status", response_model=SupportThreadResponse)
async def update_thread_status(
    thread_id: uuid.UUID,
    payload: SupportThreadStatusUpdate,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only: resolve or re-open a support thread."""
    return await SupportService.update_status(
        db=db,
        user=admin,
        thread_id=thread_id,
        status=payload.status,
    )
