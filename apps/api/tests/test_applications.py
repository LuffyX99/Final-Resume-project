"""Integration tests for the candidate application journey."""

from io import BytesIO

import pytest
from docx import Document
from httpx import AsyncClient
from sqlalchemy import func, select

from app.config import settings
from app.models import Application, Resume, User
from app.services.application_matching import ApplicationMatchingService
from app.services.application_pipeline import (
    ApplicationPipelineService,
    PipelineValidationError,
)
from app.services.application_service import ApplicationValidationError
from tests.conftest import TEST_PASSWORD, registration_payload


def make_docx(text: str = "Python FastAPI engineer with platform experience.") -> bytes:
    document = Document()
    document.add_paragraph(text)
    buffer = BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def application_form(job_id: str, **overrides) -> dict[str, str]:
    data = {
        "job_id": job_id,
        "full_name": "Ada Candidate",
        "phone_number": "+919876543210",
        "age": "29",
        "gender": "female",
    }
    data.update(overrides)
    return data


def application_files(
    filename: str = "ada-resume.docx", content: bytes | None = None
) -> dict:
    return {
        "file": (
            filename,
            content if content is not None else make_docx(),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
    }


async def create_job(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    title: str = "Backend Engineer",
) -> str:
    response = await client.post(
        "/api/jobs",
        json={
            "title": title,
            "company": "Acme",
            "description": "Build APIs with Python and PostgreSQL.",
            "required_skills": ["Python", "PostgreSQL"],
        },
        headers=recruiter_headers,
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def second_candidate_headers(client: AsyncClient) -> dict[str, str]:
    response = await client.post(
        "/api/auth/register/candidate",
        json=registration_payload(
            "second@example.com", full_name="Second Candidate"
        ),
    )
    assert response.status_code == 201, response.text
    login = await client.post(
        "/api/auth/login",
        json={"email": "second@example.com", "password": TEST_PASSWORD},
    )
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


class TestApplicationSubmission:
    @pytest.mark.asyncio
    async def test_one_call_creates_application_resume_and_match(
        self,
        client: AsyncClient,
        candidate_headers,
        recruiter_headers,
        mock_embedding_service,
        mock_skill_extraction,
    ):
        job_id = await create_job(client, recruiter_headers)

        response = await client.post(
            "/api/applications",
            data=application_form(job_id),
            files=application_files(),
            headers=candidate_headers,
        )
        assert response.status_code == 201, response.text

        data = response.json()
        assert data["job_id"] == job_id
        assert data["status"] in ("submitted", "shortlisted")
        assert data["applicant_name"] == "Ada Candidate"
        assert data["applicant_email"] == "candidate@example.com"
        assert data["job"]["title"] == "Backend Engineer"
        assert data["resume"]["file_name"] == "ada-resume.docx"
        assert data["resume"]["skills"] == ["Python", "FastAPI", "SQL"]
        assert data["match"] is not None
        assert data["match"]["similarity_score"] == pytest.approx(1.0)
        assert data["match"]["candidate_name"] == "Ada Candidate"

        mine = await client.get("/api/applications/mine", headers=candidate_headers)
        assert mine.status_code == 200
        assert len(mine.json()) == 1
        assert mine.json()[0]["id"] == data["id"]

        # Step 1 details are persisted to the profile for the next prefill.
        me = await client.get("/api/auth/me", headers=candidate_headers)
        assert me.json()["full_name"] == "Ada Candidate"
        assert me.json()["phone_number"] == "+919876543210"

    @pytest.mark.asyncio
    async def test_duplicate_application_is_rejected(
        self,
        client: AsyncClient,
        candidate_headers,
        recruiter_headers,
        db_session,
        mock_embedding_service,
        mock_skill_extraction,
    ):
        job_id = await create_job(client, recruiter_headers)

        first = await client.post(
            "/api/applications",
            data=application_form(job_id),
            files=application_files(),
            headers=candidate_headers,
        )
        assert first.status_code == 201

        second = await client.post(
            "/api/applications",
            data=application_form(job_id),
            files=application_files("second.docx"),
            headers=candidate_headers,
        )
        assert second.status_code == 409
        assert "already applied" in second.json()["detail"].lower()

        application_count = await db_session.scalar(
            select(func.count()).select_from(Application)
        )
        resume_count = await db_session.scalar(
            select(func.count()).select_from(Resume)
        )
        assert application_count == 1
        assert resume_count == 1

    @pytest.mark.asyncio
    async def test_a_different_candidate_can_apply_to_the_same_job(
        self,
        client: AsyncClient,
        candidate_headers,
        recruiter_headers,
        mock_embedding_service,
        mock_skill_extraction,
    ):
        job_id = await create_job(client, recruiter_headers)
        other_headers = await second_candidate_headers(client)

        first = await client.post(
            "/api/applications",
            data=application_form(job_id),
            files=application_files(),
            headers=candidate_headers,
        )
        second = await client.post(
            "/api/applications",
            data=application_form(job_id, full_name="Second Candidate"),
            files=application_files("second-resume.docx"),
            headers=other_headers,
        )

        assert first.status_code == 201
        assert second.status_code == 201

    @pytest.mark.asyncio
    async def test_closed_job_cannot_be_applied_to(
        self,
        client: AsyncClient,
        candidate_headers,
        recruiter_headers,
        mock_embedding_service,
        mock_skill_extraction,
    ):
        job_id = await create_job(client, recruiter_headers)
        close = await client.post(
            f"/api/jobs/{job_id}/close", headers=recruiter_headers
        )
        assert close.status_code == 200

        response = await client.post(
            "/api/applications",
            data=application_form(job_id),
            files=application_files(),
            headers=candidate_headers,
        )
        assert response.status_code == 409
        assert "no longer accepting" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_recruiter_cannot_submit_an_application(
        self,
        client: AsyncClient,
        recruiter_headers,
        mock_embedding_service,
        mock_skill_extraction,
    ):
        job_id = await create_job(client, recruiter_headers)
        response = await client.post(
            "/api/applications",
            data=application_form(job_id),
            files=application_files(),
            headers=recruiter_headers,
        )
        assert response.status_code == 403


class TestApplicationUploadValidation:
    @pytest.mark.asyncio
    async def test_unsupported_file_type_is_rejected(
        self,
        client: AsyncClient,
        candidate_headers,
        recruiter_headers,
        db_session,
        mock_embedding_service,
        mock_skill_extraction,
    ):
        job_id = await create_job(client, recruiter_headers)

        response = await client.post(
            "/api/applications",
            data=application_form(job_id),
            files={"file": ("resume.txt", b"not a resume", "text/plain")},
            headers=candidate_headers,
        )
        assert response.status_code == 400
        assert "only pdf and docx" in response.json()["detail"].lower()

        application_count = await db_session.scalar(
            select(func.count()).select_from(Application)
        )
        assert application_count == 0

    @pytest.mark.asyncio
    async def test_oversized_file_is_rejected_before_writes(
        self,
        client: AsyncClient,
        candidate_headers,
        recruiter_headers,
        db_session,
        monkeypatch,
        mock_embedding_service,
        mock_skill_extraction,
    ):
        job_id = await create_job(client, recruiter_headers)
        monkeypatch.setattr(settings, "max_resume_bytes", 10)

        response = await client.post(
            "/api/applications",
            data=application_form(job_id),
            files=application_files(),
            headers=candidate_headers,
        )
        assert response.status_code == 413
        assert "smaller" in response.json()["detail"].lower()

        application_count = await db_session.scalar(
            select(func.count()).select_from(Application)
        )
        resume_count = await db_session.scalar(
            select(func.count()).select_from(Resume)
        )
        assert application_count == 0
        assert resume_count == 0

    @pytest.mark.asyncio
    async def test_corrupt_docx_is_rejected(
        self,
        client: AsyncClient,
        candidate_headers,
        recruiter_headers,
        mock_embedding_service,
        mock_skill_extraction,
    ):
        job_id = await create_job(client, recruiter_headers)

        response = await client.post(
            "/api/applications",
            data=application_form(job_id),
            files=application_files(
                "resume.docx", b"PK\x03\x04not-a-real-docx"
            ),
            headers=candidate_headers,
        )
        assert response.status_code == 400
        assert "could not read" in response.json()["detail"].lower()


class TestApplicationTransaction:
    @pytest.mark.asyncio
    async def test_matching_failure_rolls_back_application_and_profile(
        self,
        client: AsyncClient,
        candidate_headers,
        recruiter_headers,
        db_session,
        monkeypatch,
        mock_embedding_service,
        mock_skill_extraction,
    ):
        job_id = await create_job(client, recruiter_headers)

        def fail_matching(*args, **kwargs):
            raise PipelineValidationError("Matching pipeline failed.")

        monkeypatch.setattr(
            "app.services.application_pipeline.SkillGapService.analyze",
            fail_matching,
        )

        response = await client.post(
            "/api/applications",
            data=application_form(job_id),
            files=application_files(),
            headers=candidate_headers,
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Matching pipeline failed."

        application_count = await db_session.scalar(
            select(func.count()).select_from(Application)
        )
        resume_count = await db_session.scalar(
            select(func.count()).select_from(Resume)
        )
        assert application_count == 0
        assert resume_count == 0

        user = (
            await db_session.execute(
                select(User).where(User.email == "candidate@example.com")
            )
        ).scalar_one()
        assert user.full_name == "Test Person"


class TestApplicationStatus:
    @pytest.mark.asyncio
    async def test_recruiter_shortlist_updates_candidate_application_status(
        self,
        client: AsyncClient,
        candidate_headers,
        recruiter_headers,
        mock_embedding_service,
        mock_skill_extraction,
    ):
        job_id = await create_job(client, recruiter_headers)
        submitted = await client.post(
            "/api/applications",
            data=application_form(job_id),
            files=application_files(),
            headers=candidate_headers,
        )
        assert submitted.status_code == 201
        match_id = submitted.json()["match"]["id"]

        shortlist = await client.patch(
            f"/api/matches/{match_id}",
            json={"shortlisted": True},
            headers=recruiter_headers,
        )
        assert shortlist.status_code == 200

        mine = await client.get("/api/applications/mine", headers=candidate_headers)
        assert mine.json()[0]["status"] == "shortlisted"

        unshortlist = await client.patch(
            f"/api/matches/{match_id}",
            json={"shortlisted": False},
            headers=recruiter_headers,
        )
        assert unshortlist.status_code == 200

        mine = await client.get("/api/applications/mine", headers=candidate_headers)
        assert mine.json()[0]["status"] == "submitted"

    @pytest.mark.asyncio
    async def test_my_applications_filters_by_job(
        self,
        client: AsyncClient,
        candidate_headers,
        recruiter_headers,
        mock_embedding_service,
        mock_skill_extraction,
    ):
        first_job = await create_job(client, recruiter_headers, "First Role")
        second_job = await create_job(client, recruiter_headers, "Second Role")

        for job_id in (first_job, second_job):
            response = await client.post(
                "/api/applications",
                data=application_form(job_id),
                files=application_files(f"{job_id}.docx"),
                headers=candidate_headers,
            )
            assert response.status_code == 201

        filtered = await client.get(
            f"/api/applications/mine?job_id={second_job}",
            headers=candidate_headers,
        )
        assert filtered.status_code == 200
        assert len(filtered.json()) == 1
        assert filtered.json()[0]["job_id"] == second_job
