import asyncio
from datetime import datetime, timezone
import json
import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock
import pytest
from httpx import ASGITransport, AsyncClient

from app.database import get_db
from app.main import app
from app.models import Application, Job, Match, Notification, Resume, User
from app.schemas.job import JobCreate
from app.security import create_access_token, hash_password
from app.services.admin_service import AdminService
from app.services.application_pipeline import ApplicationPipelineService
from app.services.events import event_dispatcher
from app.services.job_service import JobService
from app.services.notification_service import NotificationService


class TwoBrowserInMemorySession:
    def __init__(self):
        self.storage: dict[type, dict[uuid.UUID, Any]] = {
            User: {},
            Job: {},
            Application: {},
            Match: {},
            Notification: {},
            Resume: {},
        }
        self.committed = False

    def add(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = uuid.uuid4()
        for model_cls in self.storage:
            if isinstance(obj, model_cls):
                self.storage[model_cls][obj.id] = obj

    def add_all(self, objs):
        for obj in objs:
            self.add(obj)

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
            if "notification" in str_stmt:
                items = [n for n in self.storage[Notification].values() if not n.is_read]
            elif "application" in str_stmt:
                items = list(self.storage[Application].values())
            elif "match" in str_stmt:
                items = list(self.storage[Match].values())
            elif "user" in str_stmt:
                items = list(self.storage[User].values())
            else:
                items = []
            mock_result.scalar.return_value = len(items)
            mock_result.one_or_none.return_value = (len(items), 0)
            mock_result.all.return_value = []
            return mock_result

        # Default fallback
        mock_result.scalar.return_value = 0
        mock_result.scalars.return_value.all.return_value = []
        mock_result.one_or_none.return_value = None
        mock_result.all.return_value = []
        return mock_result


@pytest.fixture(autouse=True)
def clean_events_and_overrides():
    event_dispatcher.clear()
    yield
    event_dispatcher.clear()
    app.dependency_overrides.clear()


@pytest.fixture
def mock_embedding_and_skills(monkeypatch):
    from app.services.embedding import EmbeddingService
    from app.services.sbert import SBERTService
    from app.services.skill_extraction import SkillExtractionService

    fake_vector = [0.05] * 384
    monkeypatch.setattr(
        EmbeddingService,
        "get_embedding",
        AsyncMock(return_value=fake_vector),
    )
    monkeypatch.setattr(
        SkillExtractionService,
        "extract_skills",
        AsyncMock(return_value=["Python", "FastAPI", "PostgreSQL"]),
    )


@pytest.mark.asyncio
class TestTwoBrowserRealtimeInteraction:
    """Simulates multi-browser real-time workflows between candidates, recruiters, and admins."""

    async def test_recruiter_post_job_delivers_to_candidate_stream(
        self, mock_embedding_and_skills
    ):
        session = TwoBrowserInMemorySession()
        recruiter = User(
            id=uuid.uuid4(),
            email="recruiter@tech.com",
            role="recruiter",
            full_name="Tech Recruiter",
            is_active=True,
        )
        candidate = User(
            id=uuid.uuid4(),
            email="candidate@tech.com",
            role="candidate",
            full_name="Alice Candidate",
            is_active=True,
        )
        session.add_all([recruiter, candidate])

        cand_queue = asyncio.Queue()
        unsub_cand = event_dispatcher.subscribe_user(
            str(candidate.id), candidate.role, cand_queue
        )

        try:
            job_svc = JobService()
            job_payload = JobCreate(
                title="Distributed Systems Lead",
                company="TechScale AI",
                description="Lead distributed systems architecture.",
                required_skills=["Python", "FastAPI"],
            )

            job = await job_svc.create_job(session, recruiter, job_payload)
            assert job is not None

            # Candidate stream immediately receives job.created
            assert not cand_queue.empty()
            event = cand_queue.get_nowait()
            assert event["event"] == "job.created"
            assert event["payload"]["title"] == "Distributed Systems Lead"
            assert event["payload"]["job_id"] == str(job.id)
            assert event["payload"]["recruiter_id"] == str(recruiter.id)
        finally:
            unsub_cand()

    async def test_candidate_application_delivers_to_recruiter_and_hides_from_other_candidates(
        self, mock_embedding_and_skills
    ):
        session = TwoBrowserInMemorySession()
        recruiter = User(
            id=uuid.uuid4(),
            email="recruiter2@tech.com",
            role="recruiter",
            full_name="Bob Recruiter",
            is_active=True,
        )
        candidate_alice = User(
            id=uuid.uuid4(),
            email="alice@tech.com",
            role="candidate",
            full_name="Alice Applicant",
            is_active=True,
        )
        candidate_charlie = User(
            id=uuid.uuid4(),
            email="charlie@tech.com",
            role="candidate",
            full_name="Charlie Bystander",
            is_active=True,
        )
        job = Job(
            id=uuid.uuid4(),
            title="Senior Python Architect",
            company="InnovateCorp",
            description="Build scalable microservices.",
            skills=["Python", "FastAPI"],
            required_skills=["Python", "FastAPI"],
            recruiter_id=recruiter.id,
            status="open",
        )
        session.add_all([recruiter, candidate_alice, candidate_charlie, job])

        rec_queue = asyncio.Queue()
        charlie_queue = asyncio.Queue()

        unsub_rec = event_dispatcher.subscribe_user(
            str(recruiter.id), recruiter.role, rec_queue
        )
        unsub_charlie = event_dispatcher.subscribe_user(
            str(candidate_charlie.id), candidate_charlie.role, charlie_queue
        )

        try:
            # Emit application.submitted and scores.ready as application pipeline does
            app_id = uuid.uuid4()
            payload = {
                "application_id": str(app_id),
                "job_id": str(job.id),
                "recruiter_id": str(recruiter.id),
                "candidate_id": str(candidate_alice.id),
                "candidate_name": candidate_alice.full_name,
                "status": "shortlisted",
                "final_score": 92.5,
                "similarity_score": 94.0,
                "trust_score": 100.0,
                "readiness_score": 88.0,
                "shortlisted": True,
            }
            await event_dispatcher.emit("application.submitted", payload)
            await event_dispatcher.emit("scores.ready", payload)

            # Recruiter received both events immediately
            assert not rec_queue.empty()
            e1 = rec_queue.get_nowait()
            assert e1["event"] == "application.submitted"
            assert e1["payload"]["candidate_name"] == "Alice Applicant"

            assert not rec_queue.empty()
            e2 = rec_queue.get_nowait()
            assert e2["event"] == "scores.ready"
            assert e2["payload"]["final_score"] == 92.5

            # Unrelated candidate Charlie received ZERO private events
            assert charlie_queue.empty()
        finally:
            unsub_rec()
            unsub_charlie()

    async def test_recruiter_interview_invite_delivers_to_candidate_stream(
        self, mock_embedding_and_skills
    ):
        session = TwoBrowserInMemorySession()
        recruiter = User(
            id=uuid.uuid4(),
            email="recruiter3@tech.com",
            role="recruiter",
            full_name="Dave Recruiter",
            is_active=True,
        )
        candidate = User(
            id=uuid.uuid4(),
            email="eve@tech.com",
            role="candidate",
            full_name="Eve Candidate",
            is_active=True,
        )
        job = Job(
            id=uuid.uuid4(),
            title="Frontend Specialist",
            company="DesignWorks",
            description="UI/UX engineering.",
            recruiter_id=recruiter.id,
            status="open",
        )
        app_obj = Application(
            id=uuid.uuid4(),
            job_id=job.id,
            candidate_id=candidate.id,
            applicant_name=candidate.full_name,
            applicant_email=candidate.email,
            status="shortlisted",
        )
        session.add_all([recruiter, candidate, job, app_obj])

        cand_queue = asyncio.Queue()
        unsub_cand = event_dispatcher.subscribe_user(
            str(candidate.id), candidate.role, cand_queue
        )

        try:
            notif_svc = NotificationService()
            notif = await notif_svc.send_shortlist_invitation(
                db=session,
                recruiter=recruiter,
                application_id=app_obj.id,
                venue="Google Meet: meet.google.com/abc-xyz",
                interview_date="2026-12-01",
                interview_time="10:00 AM",
                mode="online",
                contact_person="Dave Recruiter",
                notes="Portfolio presentation",
            )
            assert notif is not None

            # Candidate stream receives notification.created immediately
            assert not cand_queue.empty()
            event = cand_queue.get_nowait()
            assert event["event"] == "notification.created"
            assert event["payload"]["user_id"] == str(candidate.id)
            assert event["payload"]["notification_type"] == "shortlist_invitation"
        finally:
            unsub_cand()

    async def test_admin_job_takedown_broadcasts_to_both_recruiter_and_candidate(
        self, mock_embedding_and_skills
    ):
        session = TwoBrowserInMemorySession()
        admin = User(
            id=uuid.uuid4(),
            email="admin@platform.com",
            role="admin",
            full_name="Platform Admin",
            is_active=True,
        )
        recruiter = User(
            id=uuid.uuid4(),
            email="recruiter4@tech.com",
            role="recruiter",
            full_name="Frank Recruiter",
            is_active=True,
        )
        candidate = User(
            id=uuid.uuid4(),
            email="grace@tech.com",
            role="candidate",
            full_name="Grace Candidate",
            is_active=True,
        )
        job = Job(
            id=uuid.uuid4(),
            title="Spam Job",
            company="FakeCo",
            description="Fake posting.",
            recruiter_id=recruiter.id,
            status="open",
            created_at=datetime.now(timezone.utc),
        )
        session.add_all([admin, recruiter, candidate, job])

        rec_queue = asyncio.Queue()
        cand_queue = asyncio.Queue()

        unsub_rec = event_dispatcher.subscribe_user(
            str(recruiter.id), recruiter.role, rec_queue
        )
        unsub_cand = event_dispatcher.subscribe_user(
            str(candidate.id), candidate.role, cand_queue
        )

        try:
            await AdminService.takedown_job(
                db=session,
                job_id=job.id,
                reason="Terms of service violation: spam",
            )

            # Both recruiter and candidate streams receive job.taken_down immediately
            assert not rec_queue.empty()
            rec_event = rec_queue.get_nowait()
            assert rec_event["event"] == "job.taken_down"
            assert rec_event["payload"]["job_id"] == str(job.id)

            assert not cand_queue.empty()
            cand_event = cand_queue.get_nowait()
            assert cand_event["event"] == "job.taken_down"
            assert cand_event["payload"]["job_id"] == str(job.id)
        finally:
            unsub_rec()
            unsub_cand()
