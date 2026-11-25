import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.models import Application, Job, Match, Resume, User
from app.services.application_pipeline import (
    ApplicationPipelineService,
    PipelineConflictError,
    PipelineForbiddenError,
    PipelineNotFoundError,
    PipelineValidationError,
)
from app.services.events import event_dispatcher
from app.services.sbert import SBERTService


class InMemorySession:
    """Deterministic in-memory mock session for async pipeline testing."""

    def __init__(self):
        self.storage: dict[type, dict[uuid.UUID, Any]] = {
            User: {},
            Job: {},
            Resume: {},
            Application: {},
            Match: {},
        }
        self.added_records = []
        self.is_committed = False
        self.is_rolled_back = False

    def add(self, obj):
        self.added_records.append(obj)
        if getattr(obj, "id", None) is None:
            obj.id = uuid.uuid4()
        for model_cls in self.storage:
            if isinstance(obj, model_cls):
                self.storage[model_cls][obj.id] = obj

    async def flush(self):
        pass

    async def commit(self):
        self.is_committed = True

    async def rollback(self):
        self.is_rolled_back = True

    async def refresh(self, obj):
        pass

    async def get(self, entity, ident):
        return self.storage.get(entity, {}).get(ident)

    async def scalar(self, stmt):
        # Handle duplicate application query
        str_stmt = str(stmt)
        if "applications" in str_stmt.lower():
            # Check if any application matches
            for app in self.storage[Application].values():
                return app.id
        return None

    async def execute(self, stmt):
        mock_result = MagicMock()
        # If querying Match
        matches = list(self.storage[Match].values())
        mock_result.scalar_one_or_none.return_value = matches[0] if matches else None
        return mock_result


@pytest.fixture(autouse=True)
def disable_external_network(monkeypatch):
    monkeypatch.setattr("app.config.settings.openai_api_key", "")
    monkeypatch.setattr("app.services.skill_extraction.settings.openai_api_key", "")


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
def sample_job(session: InMemorySession, sample_recruiter: User) -> Job:
    sbert = SBERTService.get_instance()
    # Fast unit vector
    embed = sbert._encode_chunk_sync("Senior Backend Engineer Python FastAPI PostgreSQL Docker")
    job = Job(
        id=uuid.uuid4(),
        title="Senior Backend Engineer",
        company="Acme Corp",
        description="Build high-performance REST APIs with Python, FastAPI, and PostgreSQL on Docker.",
        skills=["Python", "FastAPI", "PostgreSQL", "Docker"],
        required_skills=["Python", "FastAPI", "PostgreSQL"],
        extracted_skills=["Python", "FastAPI", "PostgreSQL", "Docker"],
        recruiter_id=sample_recruiter.id,
        status="open",
        embedding=embed,
    )
    session.add(job)
    return job


class TestApplicationPipeline:
    @pytest.mark.asyncio
    async def test_pipeline_e2e_successful_submission_and_event_emission(
        self, session: InMemorySession, sample_candidate: User, sample_job: Job
    ):
        event_dispatcher.clear()
        events_captured = []

        async def capture_event(name: str, payload: dict):
            events_captured.append((name, payload))

        event_dispatcher.subscribe("application.submitted", capture_event)

        pipeline = ApplicationPipelineService()
        resume_text = (
            "Alice Candidate\n\n"
            "Summary:\n"
            "Senior Python Engineer with 6 years building distributed APIs using FastAPI, PostgreSQL, and Docker.\n\n"
            "Experience:\n"
            "Lead Backend Engineer (2024 - Present):\n"
            "Architected cloud services with FastAPI and PostgreSQL.\n\n"
            "Software Developer (2020 - 2023):\n"
            "Maintained backend pipelines using Python and Docker.\n"
        )

        result = await pipeline.execute_submission_pipeline(
            session,
            user=sample_candidate,
            job_id=sample_job.id,
            full_name="Alice Candidate",
            phone_number="+15550001111",
            age=30,
            gender="Female",
            resume_bytes=b"%PDF-1.4 dummy",
            resume_filename="alice_resume.pdf",
            resume_content=resume_text,
        )

        # 1. Validation and Snapshot
        assert result.application is not None
        assert result.application.applicant_name == "Alice Candidate"
        assert result.application.applicant_email == "candidate@example.com"
        assert result.application.applicant_age == 30

        # 2. Stage 1 & 2: Skill extraction and SBERT embedding
        assert result.resume is not None
        assert "Python" in (result.resume.skills or [])
        assert len(result.resume.embedding) == 384
        assert result.application.similarity_score > 0.60

        # 3. Stage 3 & 4: Trust, Final Score, and Skill Gap
        assert result.application.trust_score >= 0.90
        assert result.application.final_score > 0.70
        assert result.application.readiness_score > 70
        assert result.application.skill_gap_analysis is not None
        assert "Python" in result.application.skill_gap_analysis["matched_skills"]

        # 4. Stage 5: Shortlisting check
        if result.application.final_score >= 0.85:
            assert result.application.status == "shortlisted"
            assert result.match.shortlisted is True
        else:
            assert result.application.status == "submitted"
            assert result.match.shortlisted is False

        # 5. Stage 6: Persistence committed
        assert session.is_committed is True
        assert session.is_rolled_back is False
        assert result.application.id in session.storage[Application]
        assert result.resume.id in session.storage[Resume]
        assert result.match.id in session.storage[Match]

        # 6. Event emitted
        assert len(events_captured) == 1
        assert events_captured[0][0] == "application.submitted"
        assert events_captured[0][1]["application_id"] == str(result.application.id)
        assert events_captured[0][1]["candidate_name"] == "Alice Candidate"

    @pytest.mark.asyncio
    async def test_auto_shortlisting_logic(
        self, session: InMemorySession, sample_candidate: User, sample_job: Job
    ):
        pipeline = ApplicationPipelineService()

        # Near-identical text to trigger high similarity and high final score >= 0.85
        high_score_resume = (
            "Senior Backend Engineer with deep mastery of Python, FastAPI, and PostgreSQL on Docker. "
            "Build high-performance REST APIs with Python, FastAPI, and PostgreSQL on Docker. "
            "Experience: 2024 - Present: Staff Software Engineer designing FastAPI and PostgreSQL systems."
        )

        result = await pipeline.execute_submission_pipeline(
            session,
            user=sample_candidate,
            job_id=sample_job.id,
            full_name="Alice Candidate",
            phone_number="+15550001111",
            age=28,
            gender="Female",
            resume_bytes=b"%PDF-1.4 dummy",
            resume_filename="alice_high.pdf",
            resume_content=high_score_resume,
        )

        assert result.application.final_score is not None
        if result.application.final_score >= 0.85:
            assert result.application.status == "shortlisted"
            assert result.match.shortlisted is True
        else:
            assert result.application.status == "submitted"
            assert result.match.shortlisted is False

    @pytest.mark.asyncio
    async def test_atomic_rollback_on_pipeline_failure(
        self, session: InMemorySession, sample_candidate: User, sample_job: Job
    ):
        pipeline = ApplicationPipelineService()

        # Mock embedding service to simulate mid-pipeline failure
        class FailingEmbeddingService:
            async def get_embedding(self, text: str):
                raise RuntimeError("Simulated model worker crash during embedding")

        pipeline.embedding_service = FailingEmbeddingService()

        with pytest.raises(RuntimeError, match="Simulated model worker crash"):
            await pipeline.execute_submission_pipeline(
                session,
                user=sample_candidate,
                job_id=sample_job.id,
                full_name="Alice Candidate",
                phone_number="+15550001111",
                age=28,
                gender="Female",
                resume_bytes=b"%PDF-1.4 dummy",
                resume_filename="alice.pdf",
                resume_content="Software Engineer Python",
            )

        # Verify transaction was rolled back and not committed
        assert session.is_rolled_back is True
        assert session.is_committed is False
        assert len(session.storage[Application]) == 0
        assert len(session.storage[Resume]) == 0
        assert len(session.storage[Match]) == 0

    @pytest.mark.asyncio
    async def test_idempotency_prevents_duplicate_applications(
        self, session: InMemorySession, sample_candidate: User, sample_job: Job
    ):
        pipeline = ApplicationPipelineService()
        resume_text = "Software Engineer with Python, FastAPI, and Docker experience."

        # First submission succeeds
        await pipeline.execute_submission_pipeline(
            session,
            user=sample_candidate,
            job_id=sample_job.id,
            full_name="Alice Candidate",
            phone_number="+15550001111",
            age=28,
            gender="Female",
            resume_bytes=b"%PDF-1.4 dummy",
            resume_filename="alice.pdf",
            resume_content=resume_text,
        )

        # Second submission to same job triggers duplicate detection and raises PipelineConflictError
        with pytest.raises(PipelineConflictError, match="already applied"):
            await pipeline.execute_submission_pipeline(
                session,
                user=sample_candidate,
                job_id=sample_job.id,
                full_name="Alice Candidate",
                phone_number="+15550001111",
                age=28,
                gender="Female",
                resume_bytes=b"%PDF-1.4 dummy",
                resume_filename="alice.pdf",
                resume_content=resume_text,
            )

    @pytest.mark.asyncio
    async def test_cannot_apply_to_closed_job(
        self, session: InMemorySession, sample_candidate: User, sample_job: Job
    ):
        sample_job.status = "closed"

        pipeline = ApplicationPipelineService()
        with pytest.raises(PipelineConflictError, match="no longer accepting"):
            await pipeline.execute_submission_pipeline(
                session,
                user=sample_candidate,
                job_id=sample_job.id,
                full_name="Alice Candidate",
                phone_number="+15550001111",
                age=28,
                gender="Female",
                resume_bytes=b"%PDF-1.4 dummy",
                resume_filename="alice.pdf",
                resume_content="Python developer",
            )

    @pytest.mark.asyncio
    async def test_recruiter_shortlist_override_with_audit_trail(
        self,
        session: InMemorySession,
        sample_candidate: User,
        sample_job: Job,
        sample_recruiter: User,
        other_recruiter: User,
    ):
        event_dispatcher.clear()
        override_events = []

        async def capture_override(name: str, payload: dict):
            override_events.append((name, payload))

        event_dispatcher.subscribe("application.shortlist_overridden", capture_override)

        pipeline = ApplicationPipelineService()
        result = await pipeline.execute_submission_pipeline(
            session,
            user=sample_candidate,
            job_id=sample_job.id,
            full_name="Alice Candidate",
            phone_number="+15550001111",
            age=28,
            gender="Female",
            resume_bytes=b"%PDF-1.4 dummy",
            resume_filename="alice.pdf",
            resume_content="Software engineer Python FastAPI",
        )

        app_id = result.application.id

        # 1. Unauthorized recruiter cannot override
        with pytest.raises(PipelineForbiddenError, match="access"):
            await pipeline.override_shortlist(
                session,
                application_id=app_id,
                recruiter=other_recruiter,
                shortlisted=True,
                reason="Unauthorized attempt",
            )

        # 2. Legitimate recruiter overrides shortlist decision
        updated_app = await pipeline.override_shortlist(
            session,
            application_id=app_id,
            recruiter=sample_recruiter,
            shortlisted=True,
            reason="Exceptional domain expertise and high system design readiness",
        )

        assert updated_app.status == "shortlisted"
        assert len(updated_app.audit_trail) == 1
        audit = updated_app.audit_trail[0]
        assert audit["action"] == "shortlist_override"
        assert audit["user_id"] == str(sample_recruiter.id)
        assert audit["user_email"] == "recruiter@acme.com"
        assert audit["new_status"] == "shortlisted"
        assert audit["new_shortlisted"] is True
        assert audit["reason"] == "Exceptional domain expertise and high system design readiness"

        # 3. Match row is also synchronized
        assert result.match.shortlisted is True

        # 4. Override event captured
        assert len(override_events) == 1
        assert override_events[0][0] == "application.shortlist_overridden"
        assert override_events[0][1]["application_id"] == str(app_id)
        assert override_events[0][1]["shortlisted"] is True

        # 5. Subsequent override is also appended to audit trail
        revoked_app = await pipeline.override_shortlist(
            session,
            application_id=app_id,
            recruiter=sample_recruiter,
            shortlisted=False,
            reason="Candidate withdrew interest verbally",
        )
        assert revoked_app.status == "submitted"
        assert len(revoked_app.audit_trail) == 2
        assert revoked_app.audit_trail[1]["new_shortlisted"] is False
