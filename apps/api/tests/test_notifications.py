import asyncio
import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock
import pytest

from app.models import Application, Job, Notification, User
from app.services.email import email_service
from app.services.notification_service import (
    NotificationForbiddenError,
    NotificationNotFoundError,
    NotificationService,
    NotificationValidationError,
)


class InMemorySession:
    def __init__(self):
        self.storage: dict[type, dict[uuid.UUID, Any]] = {
            User: {},
            Job: {},
            Application: {},
            Notification: {},
        }
        self.committed = False

    def add(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = uuid.uuid4()
        for model_cls in self.storage:
            if isinstance(obj, model_cls):
                self.storage[model_cls][obj.id] = obj

    async def flush(self):
        pass

    async def commit(self):
        self.committed = True

    async def rollback(self):
        pass

    async def refresh(self, obj):
        pass

    async def get(self, entity, ident):
        return self.storage.get(entity, {}).get(ident)

    async def execute(self, stmt):
        mock_result = MagicMock()
        str_stmt = str(stmt).lower()
        if "count" in str_stmt:
            # Count unread notifications
            unread = [
                n for n in self.storage[Notification].values() if not n.is_read
            ]
            mock_result.scalar.return_value = len(unread)
            return mock_result
        elif "update" in str_stmt:
            # Mark all as read
            count = 0
            for n in self.storage[Notification].values():
                if not n.is_read:
                    n.is_read = True
                    count += 1
            mock_result.rowcount = count
            return mock_result
        else:
            # Return list of notifications
            items = sorted(
                list(self.storage[Notification].values()),
                key=lambda x: getattr(x, "created_at", None) or 0,
                reverse=True,
            )
            mock_result.scalars.return_value.all.return_value = items
            return mock_result


@pytest.fixture
def session() -> InMemorySession:
    return InMemorySession()


@pytest.fixture
def sample_recruiter(session: InMemorySession) -> User:
    recruiter = User(
        id=uuid.uuid4(),
        email="recruiter@acme.com",
        password_hash="hashed_pwd",
        full_name="Jane Recruiter",
        role="recruiter",
        phone_number="+15551234567",
    )
    session.add(recruiter)
    return recruiter


@pytest.fixture
def other_recruiter(session: InMemorySession) -> User:
    recruiter = User(
        id=uuid.uuid4(),
        email="other@corp.com",
        password_hash="hashed_pwd",
        full_name="Bob Other",
        role="recruiter",
        phone_number="+15559876543",
    )
    session.add(recruiter)
    return recruiter


@pytest.fixture
def sample_candidate(session: InMemorySession) -> User:
    candidate = User(
        id=uuid.uuid4(),
        email="candidate@example.com",
        password_hash="hashed_pwd",
        full_name="Alice Candidate",
        role="candidate",
        phone_number="+15550001111",
    )
    session.add(candidate)
    return candidate


@pytest.fixture
def other_candidate(session: InMemorySession) -> User:
    candidate = User(
        id=uuid.uuid4(),
        email="other_candidate@example.com",
        password_hash="hashed_pwd",
        full_name="Charlie Candidate",
        role="candidate",
        phone_number="+15552223333",
    )
    session.add(candidate)
    return candidate


@pytest.fixture
def sample_job(session: InMemorySession, sample_recruiter: User) -> Job:
    job = Job(
        id=uuid.uuid4(),
        title="Senior Backend Engineer",
        company="Acme Corp",
        description="Build high-performance REST APIs with Python.",
        skills=["Python", "FastAPI"],
        required_skills=["Python", "FastAPI"],
        recruiter_id=sample_recruiter.id,
        status="open",
    )
    session.add(job)
    return job


@pytest.fixture
def shortlisted_application(
    session: InMemorySession, sample_candidate: User, sample_job: Job
) -> Application:
    app = Application(
        id=uuid.uuid4(),
        candidate_id=sample_candidate.id,
        job_id=sample_job.id,
        resume_id=uuid.uuid4(),
        status="shortlisted",
        applicant_name="Alice Candidate",
        applicant_email="candidate@example.com",
        applicant_phone_number="+15550001111",
        applicant_age=28,
        applicant_gender="Female",
    )
    session.add(app)
    return app


@pytest.fixture
def submitted_application(
    session: InMemorySession, other_candidate: User, sample_job: Job
) -> Application:
    app = Application(
        id=uuid.uuid4(),
        candidate_id=other_candidate.id,
        job_id=sample_job.id,
        resume_id=uuid.uuid4(),
        status="submitted",
        applicant_name="Charlie Candidate",
        applicant_email="other_candidate@example.com",
        applicant_phone_number="+15552223333",
        applicant_age=31,
        applicant_gender="Male",
    )
    session.add(app)
    return app


class TestNotificationService:
    @pytest.mark.asyncio
    async def test_send_shortlist_invitation_success(
        self,
        session: InMemorySession,
        sample_recruiter: User,
        shortlisted_application: Application,
        sample_job: Job,
        sample_candidate: User,
    ):
        email_service.clear()
        service = NotificationService()

        notif = await service.send_shortlist_invitation(
            session,
            recruiter=sample_recruiter,
            application_id=shortlisted_application.id,
            venue="https://meet.google.com/xyz-abc-123",
            interview_date="2026-11-25",
            interview_time="10:00 AM UTC",
            mode="online",
            contact_person="Jane Recruiter (recruiter@acme.com)",
            notes="Please bring your laptop for a live system design session.",
        )

        # 1. Database notification record
        assert notif is not None
        assert notif.user_id == sample_candidate.id
        assert notif.sender_id == sample_recruiter.id
        assert notif.job_id == sample_job.id
        assert notif.application_id == shortlisted_application.id
        assert notif.is_read is False
        assert notif.read_at is None
        assert "Interview Invitation: Senior Backend Engineer at Acme Corp" in notif.title
        assert "https://meet.google.com/xyz-abc-123" in notif.details["venue"]
        assert notif.details["mode"] == "online"
        assert notif.details["contact_person"] == "Jane Recruiter (recruiter@acme.com)"
        assert notif.id in session.storage[Notification]

        # 2. Email was dispatched to candidate in background
        # (Mock SMTP records to email_service.sent_emails)
        await asyncio.sleep(0.05)
        assert len(email_service.sent_emails) >= 1
        last_email = email_service.sent_emails[-1]
        assert last_email["to"] == "candidate@example.com"
        assert "Senior Backend Engineer" in last_email["subject"]
        assert "https://meet.google.com/xyz-abc-123" in last_email["text"]
        assert "Jane Recruiter" in last_email["text"]

    @pytest.mark.asyncio
    async def test_non_owning_recruiter_forbidden(
        self,
        session: InMemorySession,
        other_recruiter: User,
        shortlisted_application: Application,
    ):
        service = NotificationService()
        with pytest.raises(NotificationForbiddenError, match="permission"):
            await service.send_shortlist_invitation(
                session,
                recruiter=other_recruiter,
                application_id=shortlisted_application.id,
                venue="Room 402, Acme Tower",
                interview_date="2026-11-26",
                interview_time="2:00 PM",
                mode="in-person",
                contact_person="Bob Other",
            )

    @pytest.mark.asyncio
    async def test_non_shortlisted_candidate_cannot_be_invited(
        self,
        session: InMemorySession,
        sample_recruiter: User,
        submitted_application: Application,
    ):
        service = NotificationService()
        with pytest.raises(NotificationValidationError, match="Only shortlisted"):
            await service.send_shortlist_invitation(
                session,
                recruiter=sample_recruiter,
                application_id=submitted_application.id,
                venue="Room 402, Acme Tower",
                interview_date="2026-11-26",
                interview_time="2:00 PM",
                mode="in-person",
                contact_person="Jane Recruiter",
            )

    @pytest.mark.asyncio
    async def test_missing_required_fields_raises_validation_error(
        self,
        session: InMemorySession,
        sample_recruiter: User,
        shortlisted_application: Application,
    ):
        service = NotificationService()

        # Missing venue
        with pytest.raises(NotificationValidationError, match="Venue"):
            await service.send_shortlist_invitation(
                session,
                recruiter=sample_recruiter,
                application_id=shortlisted_application.id,
                venue="   ",
                interview_date="2026-11-26",
                interview_time="2:00 PM",
                mode="in-person",
                contact_person="Jane Recruiter",
            )

        # Missing date
        with pytest.raises(NotificationValidationError, match="date"):
            await service.send_shortlist_invitation(
                session,
                recruiter=sample_recruiter,
                application_id=shortlisted_application.id,
                venue="Acme HQ",
                interview_date="   ",
                interview_time="2:00 PM",
                mode="in-person",
                contact_person="Jane Recruiter",
            )

    @pytest.mark.asyncio
    async def test_candidate_inbox_and_read_state_transitions(
        self,
        session: InMemorySession,
        sample_recruiter: User,
        shortlisted_application: Application,
        sample_candidate: User,
        other_candidate: User,
    ):
        service = NotificationService()

        # Send an invitation
        notif = await service.send_shortlist_invitation(
            session,
            recruiter=sample_recruiter,
            application_id=shortlisted_application.id,
            venue="Google Meet",
            interview_date="2026-11-25",
            interview_time="10:00 AM",
            mode="online",
            contact_person="Jane Recruiter",
        )

        # 1. Candidate lists notifications
        items, unread_count = await service.list_notifications_for_user(
            session, user_id=sample_candidate.id
        )
        assert len(items) == 1
        assert unread_count == 1
        assert items[0].is_read is False

        # 2. Other candidate cannot mark read
        with pytest.raises(NotificationForbiddenError, match="denied"):
            await service.mark_as_read(
                session, user_id=other_candidate.id, notification_id=notif.id
            )

        # 3. Candidate marks as read
        updated_notif = await service.mark_as_read(
            session, user_id=sample_candidate.id, notification_id=notif.id
        )
        assert updated_notif.is_read is True
        assert updated_notif.read_at is not None

        # 4. Mark all as read
        marked_count = await service.mark_all_as_read(
            session, user_id=sample_candidate.id
        )
        assert marked_count >= 0
