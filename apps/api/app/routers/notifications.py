import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user, require_role
from app.models import User
from app.schemas.notification import (
    InterviewInviteRequest,
    NotificationListResponse,
    NotificationResponse,
)
from app.services.notification_service import (
    NotificationError,
    NotificationService,
    notification_service,
)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.post(
    "/invite",
    response_model=NotificationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def send_interview_invitation(
    body: InterviewInviteRequest,
    user: User = Depends(require_role("recruiter", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Allow job owner recruiter/admin to message shortlisted candidates."""
    try:
        notification = await notification_service.send_shortlist_invitation(
            db,
            recruiter=user,
            application_id=body.application_id,
            match_id=body.match_id,
            venue=body.venue,
            interview_date=body.interview_date,
            interview_time=body.interview_time,
            mode=body.mode,
            contact_person=body.contact_person,
            notes=body.notes,
        )
        return NotificationResponse.model_validate(notification)
    except NotificationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))


@router.get("", response_model=NotificationListResponse)
async def list_my_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=100),
    skip: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve notifications and unread count for the authenticated user."""
    items, unread_count = await notification_service.list_notifications_for_user(
        db,
        user_id=user.id,
        unread_only=unread_only,
        limit=limit,
        skip=skip,
    )
    return NotificationListResponse(
        items=[NotificationResponse.model_validate(item) for item in items],
        unread_count=unread_count,
    )


@router.patch("/{id}/read", response_model=NotificationResponse)
async def mark_notification_as_read(
    id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a specific notification as read."""
    try:
        notification = await notification_service.mark_as_read(
            db, user_id=user.id, notification_id=id
        )
        return NotificationResponse.model_validate(notification)
    except NotificationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))


@router.post("/read-all")
async def mark_all_notifications_as_read(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark all unread notifications for the user as read."""
    count = await notification_service.mark_all_as_read(db, user_id=user.id)
    return {"marked_read": count}
