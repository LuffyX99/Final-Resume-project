import asyncio
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Application, Job, Match, Resume, User
from app.models.application import TERMINAL_APPLICATION_STATUSES
from app.security import normalize_phone
from app.services.embedding import EmbeddingService
from app.services.events import event_dispatcher
from app.services.file_parser import parse_file
from app.services.integrity.scoring import TrustScoringService
from app.services.matching import MatchingService, cosine_similarity
from app.services.skill_extraction import SkillExtractionService
from app.services.skill_gap import SkillGapService

logger = logging.getLogger(__name__)


class PipelineError(Exception):
    """Base class for pipeline-level exceptions."""

    status_code = 400


class PipelineValidationError(PipelineError):
    status_code = 400


class PipelineNotFoundError(PipelineError):
    status_code = 404


class PipelineConflictError(PipelineError):
    status_code = 409


class PipelineForbiddenError(PipelineError):
    status_code = 403


@dataclass(frozen=True)
class PipelineResult:
    application: Application
    job: Job
    resume: Resume
    match: Match


class ApplicationPipelineService:
    """Orchestrates candidate application submission and recruiter overrides.

    Executes the candidate application pipeline within a single atomic database
    transaction in strict sequential order:
      1. Parse resume (off-event-loop) and extract skills.
      2. Generate SBERT embedding (off-event-loop) and compute similarity against job.
      3. Run Document Trust and fraud analysis.
      4. Compute Final Score and Skill Gap / Readiness analysis.
      5. Auto-shortlist if Final Score >= configured threshold, else mark submitted.
      6. Persist all records atomically, then emit the real-time event.
    """

    def __init__(
        self,
        embedding_service: EmbeddingService | None = None,
        skill_service: SkillExtractionService | None = None,
        trust_service: TrustScoringService | None = None,
        skill_gap_service: SkillGapService | None = None,
    ) -> None:
        self.embedding_service = embedding_service or EmbeddingService()
        self.skill_service = skill_service or SkillExtractionService()
        self.trust_service = trust_service or TrustScoringService()
        self.skill_gap_service = skill_gap_service or SkillGapService()

    async def execute_submission_pipeline(
        self,
        db: AsyncSession,
        *,
        user: User,
        job_id: uuid.UUID,
        full_name: str,
        phone_number: str,
        age: int,
        gender: str,
        resume_bytes: bytes,
        resume_filename: str,
        resume_content: str | None = None,
    ) -> PipelineResult:
        """Run the 6-stage submission pipeline within one transaction."""
        # Preliminary input validation
        clean_name = full_name.strip()
        clean_gender = gender.strip()
        if not clean_name or not clean_gender:
            raise PipelineValidationError("Personal details are required.")

        try:
            normalized_phone = normalize_phone(phone_number)
        except ValueError as exc:
            raise PipelineValidationError(str(exc)) from exc
        if not normalized_phone:
            raise PipelineValidationError("A phone number is required.")

        try:
            # Idempotency & race check: Verify job exists and is open
            job = await db.get(Job, job_id)
            if job is None:
                raise PipelineNotFoundError("Job not found.")
            if job.status != "open":
                raise PipelineConflictError("This job is no longer accepting applications.")

            # Check for existing duplicate application
            existing_app = await db.scalar(
                select(Application.id).where(
                    Application.candidate_id == user.id,
                    Application.job_id == job_id,
                )
            )
            if existing_app is not None:
                raise PipelineConflictError("You have already applied to this job.")

            # Update candidate profile snapshot
            user.full_name = clean_name
            user.phone_number = normalized_phone
            user.age = age
            user.gender = clean_gender

            # -------------------------------------------------------------
            # STAGE 1: Parse Resume (off event loop) & Extract Skills
            # -------------------------------------------------------------
            if resume_content and resume_content.strip():
                content = resume_content.strip()
            else:
                if not resume_bytes:
                    raise PipelineValidationError("Resume file is empty or missing.")
                try:
                    content = await asyncio.to_thread(
                        parse_file, resume_bytes, resume_filename
                    )
                except Exception as exc:
                    raise PipelineValidationError(
                        f"Could not parse resume: {exc}"
                    ) from exc

            if not content.strip():
                raise PipelineValidationError("Could not extract readable text from resume.")

            extracted_skills = await self.skill_service.extract_skills(content)

            # -------------------------------------------------------------
            # STAGE 2: Generate SBERT Embedding & Compute Similarity
            # -------------------------------------------------------------
            embedding = await self.embedding_service.get_embedding(content)

            # Cosine similarity against job embedding
            if job.embedding is not None and len(job.embedding) > 0:
                similarity = cosine_similarity(embedding, job.embedding)
            else:
                similarity = 0.50

            # -------------------------------------------------------------
            # STAGE 3: Document Trust & Fraud Analysis
            # -------------------------------------------------------------
            job_skills = ", ".join(job.required_skills or job.skills or [])
            job_text = (
                f"{job.title} at {job.company}\n\n{job.description}\n\n"
                f"Required Skills: {job_skills}"
            )

            eval_result = self.trust_service.evaluate(
                file_bytes=resume_bytes,
                filename=resume_filename,
                resume_text=content,
                job_text=job_text,
                job_required_skills=job.required_skills or job.skills,
                similarity_score=similarity,
            )

            # -------------------------------------------------------------
            # STAGE 4: Final Score & Skill Gap / Readiness Analysis
            # -------------------------------------------------------------
            final_score = eval_result.final_score

            gap_result = self.skill_gap_service.analyze(
                required_skills=job.required_skills or [],
                extracted_skills=job.extracted_skills or job.skills or [],
                candidate_skills=extracted_skills or [],
                resume_text=content,
                similarity_score=similarity,
            )

            # -------------------------------------------------------------
            # STAGE 5: Auto-Shortlist Decision
            # -------------------------------------------------------------
            is_auto_shortlisted = eval_result.is_shortlisted
            initial_status = "shortlisted" if is_auto_shortlisted else "submitted"

            # -------------------------------------------------------------
            # STAGE 6: Atomic Persistence & Real-Time Event Emission
            # -------------------------------------------------------------
            resume = Resume(
                candidate_name=clean_name,
                content=content,
                skills=extracted_skills,
                file_name=resume_filename,
                candidate_id=user.id,
                embedding=embedding,
            )
            db.add(resume)
            await db.flush()

            application = Application(
                candidate_id=user.id,
                job_id=job.id,
                resume_id=resume.id,
                status=initial_status,
                applicant_name=clean_name,
                applicant_email=user.email,
                applicant_phone_number=normalized_phone,
                applicant_age=age,
                applicant_gender=clean_gender,
                similarity_score=similarity,
                trust_score=eval_result.trust_score,
                trust_flags=eval_result.flags_as_dicts(),
                final_score=final_score,
                readiness_score=gap_result.readiness_score,
                skill_gap_analysis=gap_result.to_dict(),
                audit_trail=[],
            )
            db.add(application)
            await db.flush()

            match = Match(
                job_id=job.id,
                resume_id=resume.id,
                similarity_score=similarity,
                bias_reduced=False,
                shortlisted=is_auto_shortlisted,
            )
            db.add(match)
            await db.flush()

            # Atomic commit of all writes
            await db.commit()

        except PipelineError:
            await db.rollback()
            raise
        except IntegrityError as exc:
            await db.rollback()
            raise PipelineConflictError("You have already applied to this job.") from exc
        except Exception as exc:
            await db.rollback()
            logger.error("Application submission pipeline failed: %s", exc, exc_info=True)
            raise

        # Post-commit event emission (safe outside the transaction)
        try:
            event_payload = {
                "application_id": str(application.id),
                "job_id": str(job.id),
                "recruiter_id": str(job.recruiter_id) if job.recruiter_id else None,
                "candidate_id": str(user.id),
                "candidate_name": clean_name,
                "status": application.status,
                "final_score": application.final_score,
                "similarity_score": application.similarity_score,
                "trust_score": application.trust_score,
                "readiness_score": application.readiness_score,
                "shortlisted": match.shortlisted,
                "submitted_at": application.created_at.isoformat() if application.created_at else None,
            }
            await event_dispatcher.emit("application.submitted", event_payload)
            await event_dispatcher.emit("scores.ready", event_payload)
        except Exception as exc:
            logger.warning("Event emission for application %s failed: %s", application.id, exc)

        return PipelineResult(
            application=application,
            job=job,
            resume=resume,
            match=match,
        )

    async def override_shortlist(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        recruiter: User,
        shortlisted: bool,
        reason: str = "",
    ) -> Application:
        """Allow a recruiter to manually override shortlist decision with audit trail."""
        application = await db.get(Application, application_id)
        if application is None:
            raise PipelineNotFoundError("Application not found.")

        job = await db.get(Job, application.job_id)
        if job is None:
            raise PipelineNotFoundError("Associated job not found.")

        # Recruiter authorization: Must own the job (unless admin)
        if recruiter.role != "admin":
            if job.recruiter_id is not None and job.recruiter_id != recruiter.id:
                raise PipelineForbiddenError("You do not have access to manage this application.")

        if application.status in TERMINAL_APPLICATION_STATUSES:
            raise PipelineConflictError(
                f"Cannot override shortlist for application with terminal status '{application.status}'."
            )

        prev_status = application.status
        new_status = "shortlisted" if shortlisted else "submitted"

        # Locate corresponding match record
        match = (
            await db.execute(
                select(Match).where(
                    Match.job_id == application.job_id,
                    Match.resume_id == application.resume_id,
                )
            )
        ).scalar_one_or_none()

        prev_shortlisted = match.shortlisted if match else (prev_status == "shortlisted")

        clean_reason = reason.strip() or (
            "Manually shortlisted by recruiter"
            if shortlisted
            else "Manually removed from shortlist by recruiter"
        )

        audit_entry: dict[str, Any] = {
            "action": "shortlist_override",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "user_id": str(recruiter.id),
            "user_email": recruiter.email,
            "user_name": recruiter.full_name,
            "previous_status": prev_status,
            "new_status": new_status,
            "previous_shortlisted": prev_shortlisted,
            "new_shortlisted": shortlisted,
            "reason": clean_reason,
            "auto_shortlisted": (application.final_score or 0.0) >= settings.shortlist_threshold,
        }

        # Update application and match
        application.status = new_status
        current_audit = list(application.audit_trail or [])
        current_audit.append(audit_entry)
        application.audit_trail = current_audit

        if match:
            match.shortlisted = shortlisted

        await db.commit()
        await db.refresh(application)

        # Emit override event
        try:
            await event_dispatcher.emit(
                "application.shortlist_overridden",
                {
                    "application_id": str(application.id),
                    "job_id": str(job.id),
                    "candidate_id": str(application.candidate_id),
                    "recruiter_id": str(recruiter.id),
                    "shortlisted": shortlisted,
                    "audit": audit_entry,
                },
            )
        except Exception as exc:
            logger.warning("Event emission for shortlist override failed: %s", exc)

        return application


application_pipeline = ApplicationPipelineService()
