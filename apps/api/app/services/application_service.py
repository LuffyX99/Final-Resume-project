import uuid
from dataclasses import dataclass

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Application, Job, Match, Resume, User
from app.services.application_pipeline import (
    ApplicationPipelineService,
    PipelineConflictError,
    PipelineError,
    PipelineNotFoundError,
    PipelineValidationError,
)


class ApplicationError(Exception):
    """Base class for client-facing application errors."""

    status_code = 400


class ApplicationValidationError(ApplicationError):
    status_code = 400


class ApplicationNotFoundError(ApplicationError):
    status_code = 404


class ApplicationConflictError(ApplicationError):
    status_code = 409


@dataclass(frozen=True)
class ApplicationSubmission:
    application: Application
    job: Job
    resume: Resume
    match: Match | None


class ApplicationService:
    def __init__(
        self, pipeline: ApplicationPipelineService | None = None
    ) -> None:
        self.pipeline = pipeline or ApplicationPipelineService()

    async def submit_application(
        self,
        db: AsyncSession,
        *,
        user: User,
        job_id: uuid.UUID,
        full_name: str,
        phone_number: str,
        age: int,
        gender: str,
        resume_content: str,
        resume_filename: str,
        resume_bytes: bytes = b"",
    ) -> ApplicationSubmission:
        """Create the resume, application, and provisional match in one commit.

        Executes the transactional 6-stage pipeline:
          1. Parse resume and extract skills.
          2. Generate SBERT embedding and compute similarity.
          3. Run Document Trust and fraud analysis.
          4. Compute Final Score and Skill Gap / Readiness.
          5. Auto-shortlist based on threshold, keeping scores visible.
          6. Persist atomically, then emit the real-time event.
        """
        try:
            result = await self.pipeline.execute_submission_pipeline(
                db,
                user=user,
                job_id=job_id,
                full_name=full_name,
                phone_number=phone_number,
                age=age,
                gender=gender,
                resume_bytes=resume_bytes,
                resume_filename=resume_filename,
                resume_content=resume_content,
            )
            return ApplicationSubmission(
                application=result.application,
                job=result.job,
                resume=result.resume,
                match=result.match,
            )
        except PipelineValidationError as exc:
            raise ApplicationValidationError(str(exc)) from exc
        except PipelineNotFoundError as exc:
            raise ApplicationNotFoundError(str(exc)) from exc
        except PipelineConflictError as exc:
            raise ApplicationConflictError(str(exc)) from exc
        except PipelineError as exc:
            raise ApplicationError(str(exc)) from exc

    async def list_for_candidate(
        self,
        db: AsyncSession,
        candidate_id: uuid.UUID,
        job_id: uuid.UUID | None = None,
    ) -> list[tuple[Application, Job, Resume, Match | None]]:
        stmt = (
            select(Application, Job, Resume, Match)
            .join(Job, Application.job_id == Job.id)
            .join(Resume, Application.resume_id == Resume.id)
            .outerjoin(
                Match,
                and_(
                    Match.job_id == Application.job_id,
                    Match.resume_id == Application.resume_id,
                ),
            )
            .where(Application.candidate_id == candidate_id)
            .order_by(Application.created_at.desc())
        )
        if job_id is not None:
            stmt = stmt.where(Application.job_id == job_id)

        rows = (await db.execute(stmt)).all()
        return [
            (application, job, resume, match)
            for application, job, resume, match in rows
        ]
