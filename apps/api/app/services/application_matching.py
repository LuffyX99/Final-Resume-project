from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Application, Job, Match, Resume
from app.services.embedding import EmbeddingService
from app.services.integrity.scoring import TrustScoringService
from app.services.matching import MatchingService
from app.services.skill_extraction import SkillExtractionService
from app.services.skill_gap import SkillGapService


class ApplicationMatchingService:
    """Seam between application submission and the matching pipeline.

    ``ApplicationService`` calls exactly one method after the application row
    exists: ``on_application_created``. Evaluates semantic similarity, document
    fraud / integrity, assigns trust score, computes final score, performs
    skill gap & readiness analysis, applies shortlisting threshold, and stores
    all intelligence scores directly on the application record.
    """

    def __init__(
        self,
        embedding_service: EmbeddingService | None = None,
        skill_service: SkillExtractionService | None = None,
        trust_service: TrustScoringService | None = None,
        skill_gap_service: SkillGapService | None = None,
    ):
        self.embedding_service = embedding_service or EmbeddingService()
        self.skill_service = skill_service or SkillExtractionService()
        self.trust_service = trust_service or TrustScoringService()
        self.skill_gap_service = skill_gap_service or SkillGapService()

    async def on_application_created(
        self,
        session: AsyncSession,
        application: Application,
        job: Job,
        resume: Resume,
        raw_bytes: bytes = b"",
        filename: str = "",
    ) -> Match | None:
        resume.embedding = await self.embedding_service.get_embedding(
            resume.content
        )
        resume.skills = await self.skill_service.extract_skills(resume.content)
        await session.flush()

        match = await MatchingService(session).score_application(job, resume)
        similarity = match.similarity_score if match else 0.0

        # Construct job description text for verbatim injection detection
        job_skills = ", ".join(job.required_skills or job.skills or [])
        job_text = f"{job.title} at {job.company}\n\n{job.description}\n\nRequired Skills: {job_skills}"

        eval_result = self.trust_service.evaluate(
            file_bytes=raw_bytes,
            filename=filename or resume.file_name or "",
            resume_text=resume.content,
            job_text=job_text,
            job_required_skills=job.required_skills or job.skills,
            similarity_score=similarity,
        )

        # Store similarity, trust, flags and final score on the application record
        application.similarity_score = eval_result.similarity_score
        application.trust_score = eval_result.trust_score
        application.trust_flags = eval_result.flags_as_dicts()
        application.final_score = eval_result.final_score

        # Perform Skill Gap & Readiness Analysis
        gap_result = self.skill_gap_service.analyze(
            required_skills=job.required_skills or [],
            extracted_skills=job.extracted_skills or job.skills or [],
            candidate_skills=resume.skills or [],
            resume_text=resume.content,
            similarity_score=similarity,
        )
        application.readiness_score = gap_result.readiness_score
        application.skill_gap_analysis = gap_result.to_dict()

        # Apply configurable shortlisting threshold on the Final Score
        if eval_result.is_shortlisted:
            application.status = "shortlisted"
            if match:
                match.shortlisted = True

        await session.flush()
        return match
