import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Application, Job, Notification, User
from app.services.email import email_service
from app.services.events import event_dispatcher

logger = logging.getLogger(__name__)


class NotificationError(Exception):
    status_code = 400


class NotificationNotFoundError(NotificationError):
    status_code = 404


class NotificationForbiddenError(NotificationError):
    status_code = 403


class NotificationValidationError(NotificationError):
    status_code = 400


class NotificationService:
    """Manages creation, query, and read-state transitions for notifications."""

    def __init__(self, email_svc=None) -> None:
        self.email_service = email_svc or email_service

    async def send_shortlist_invitation(
        self,
        db: AsyncSession,
        *,
        recruiter: User,
        application_id: uuid.UUID | None = None,
        match_id: uuid.UUID | None = None,
        venue: str,
        interview_date: str,
        interview_time: str,
        mode: str,
        contact_person: str,
        notes: str = "",
    ) -> Notification:
        """Create in-app notification and fire background email invitation.

        Only the recruiter who owns the job (or an admin) can invite shortlisted
        candidates for that job.
        """
        # Validate inputs
        clean_venue = venue.strip()
        clean_date = interview_date.strip()
        clean_time = interview_time.strip()
        clean_contact = contact_person.strip()
        clean_mode = mode.strip().lower() or "online"

        if not clean_venue:
            raise NotificationValidationError("Venue or meeting link is required.")
        if not clean_date:
            raise NotificationValidationError("Interview date is required.")
        if not clean_contact:
            raise NotificationValidationError("Contact person is required.")

        application = None
        if application_id is not None:
            application = await db.get(Application, application_id)
        elif match_id is not None:
            from app.models import Match

            match = await db.get(Match, match_id)
            if match is not None:
                application = await db.scalar(
                    select(Application).where(
                        Application.job_id == match.job_id,
                        Application.resume_id == match.resume_id,
                    )
                )

        if application is None:
            raise NotificationNotFoundError("Application not found.")

        job = await db.get(Job, application.job_id)
        if job is None:
            raise NotificationNotFoundError("Job not found.")

        # Recruiter authorization: Must own the job unless admin
        if recruiter.role != "admin":
            if job.recruiter_id is not None and job.recruiter_id != recruiter.id:
                raise NotificationForbiddenError("You do not have permission to message candidates for this job.")

        # Candidate must be shortlisted
        if application.status != "shortlisted":
            raise NotificationValidationError("Only shortlisted candidates can be sent interview invitations.")

        candidate = await db.get(User, application.candidate_id)
        if candidate is None:
            raise NotificationNotFoundError("Candidate user account not found.")

        title = f"Interview Invitation: {job.title} at {job.company}"
        schedule_str = f"{clean_date} at {clean_time}" if clean_time else clean_date
        content = (
            f"You have been invited for a {clean_mode.capitalize()} interview for the {job.title} role "
            f"at {job.company} on {schedule_str}. Venue/Link: {clean_venue}."
        )

        details: dict[str, Any] = {
            "venue": clean_venue,
            "interview_date": clean_date,
            "interview_time": clean_time,
            "mode": clean_mode,
            "contact_person": clean_contact,
            "notes": notes.strip(),
            "job_title": job.title,
            "job_company": job.company,
            "candidate_name": application.applicant_name,
            "candidate_email": application.applicant_email,
        }

        notification = Notification(
            user_id=candidate.id,
            sender_id=recruiter.id,
            job_id=job.id,
            application_id=application.id,
            title=title,
            content=content,
            notification_type="shortlist_invitation",
            details=details,
            is_read=False,
        )
        db.add(notification)
        await db.commit()
        await db.refresh(notification)

        # Dispatch background email asynchronously without blocking the response
        try:
            asyncio.create_task(
                self.email_service.send_interview_invitation(
                    to_email=candidate.email,
                    candidate_name=application.applicant_name or candidate.full_name,
                    job_title=job.title,
                    company=job.company,
                    venue=clean_venue,
                    interview_date=clean_date,
                    interview_time=clean_time,
                    mode=clean_mode,
                    contact_person=clean_contact,
                    notes=notes.strip(),
                )
            )
        except Exception as exc:
            logger.warning("Failed to schedule background email dispatch: %s", exc)

        # Emit real-time notification event
        try:
            await event_dispatcher.emit(
                "notification.created",
                {
                    "notification_id": str(notification.id),
                    "user_id": str(notification.user_id),
                    "sender_id": str(notification.sender_id) if notification.sender_id else None,
                    "job_id": str(notification.job_id) if notification.job_id else None,
                    "application_id": str(notification.application_id) if notification.application_id else None,
                    "title": notification.title,
                    "notification_type": notification.notification_type,
                },
            )
        except Exception as exc:
            logger.warning("Failed to emit notification.created event: %s", exc)

        return notification

    async def list_notifications_for_user(
        self,
        db: AsyncSession,
        *,
        user_id: uuid.UUID,
        unread_only: bool = False,
        limit: int = 50,
        skip: int = 0,
    ) -> tuple[list[Notification], int]:
        """List notifications for a candidate with total unread count."""
        stmt = (
            select(Notification)
            .where(Notification.user_id == user_id)
            .order_by(Notification.created_at.desc())
        )
        if unread_only:
            stmt = stmt.where(Notification.is_read.is_(False))

        stmt = stmt.offset(skip).limit(limit)
        result = await db.execute(stmt)
        items = list(result.scalars().all())

        unread_count_stmt = select(func.count(Notification.id)).where(
            Notification.user_id == user_id, Notification.is_read.is_(False)
        )
        unread_count = (await db.execute(unread_count_stmt)).scalar() or 0

        return items, unread_count

    async def mark_as_read(
        self,
        db: AsyncSession,
        *,
        user_id: uuid.UUID,
        notification_id: uuid.UUID,
    ) -> Notification:
        """Mark a single notification as read if owned by the user."""
        notification = await db.get(Notification, notification_id)
        if notification is None:
            raise NotificationNotFoundError("Notification not found.")

        if notification.user_id != user_id:
            raise NotificationForbiddenError("Access denied.")

        if not notification.is_read:
            notification.is_read = True
            notification.read_at = datetime.now(timezone.utc)
            await db.commit()
            await db.refresh(notification)

        return notification

    async def mark_all_as_read(
        self,
        db: AsyncSession,
        *,
        user_id: uuid.UUID,
    ) -> int:
        """Mark all unread notifications for a user as read."""
        now = datetime.now(timezone.utc)
        stmt = (
            update(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.is_read.is_(False),
            )
            .values(is_read=True, read_at=now)
        )
        res = await db.execute(stmt)
        await db.commit()
        return res.rowcount or 0


notification_service = NotificationService()
