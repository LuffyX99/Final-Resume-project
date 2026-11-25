import uuid
from datetime import datetime, timezone

from sqlalchemy import String, case, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import ensure_job_access
from app.models import Job, Match, User
from app.schemas.job import JobCreate, JobUpdate
from app.services.embedding import EmbeddingService
from app.services.events import event_dispatcher
from app.services.skill_extraction import SkillExtractionService


def merge_skills(
    required_skills: list[str] | None,
    extracted_skills: list[str] | None,
) -> list[str]:
    """Merge recruiter-typed skills with AI-extracted skills.

    Recruiter-specified skills take precedence, maintaining original casing and order.
    AI-extracted skills not already present (case-insensitive) are appended.
    """
    seen: set[str] = set()
    merged: list[str] = []

    for skill in required_skills or []:
        s = skill.strip()
        if s and s.casefold() not in seen:
            seen.add(s.casefold())
            merged.append(s)

    for skill in extracted_skills or []:
        s = skill.strip()
        if s and s.casefold() not in seen:
            seen.add(s.casefold())
            merged.append(s)

    return merged


class JobService:
    def __init__(
        self,
        embedding_service: EmbeddingService | None = None,
        skill_service: SkillExtractionService | None = None,
    ):
        self.embedding_service = embedding_service or EmbeddingService()
        self.skill_service = skill_service or SkillExtractionService()

    def _build_job_text(
        self,
        title: str,
        company: str,
        description: str,
        required_skills: list[str] | None,
    ) -> str:
        job_text = f"{title} at {company}\n\n{description}"
        if required_skills:
            job_text += f"\nRequired Skills: {', '.join(required_skills)}"
        return job_text

    async def create_job(
        self,
        db: AsyncSession,
        user: User,
        body: JobCreate,
    ) -> Job:
        job_text = self._build_job_text(
            title=body.title,
            company=body.company,
            description=body.description,
            required_skills=body.required_skills,
        )

        embedding = await self.embedding_service.get_embedding(job_text)
        extracted_skills = await self.skill_service.extract_skills(job_text)
        merged_skills = merge_skills(body.required_skills, extracted_skills)

        job = Job(
            title=body.title,
            company=body.company,
            description=body.description,
            embedding=embedding,
            skills=merged_skills,
            required_skills=body.required_skills,
            extracted_skills=extracted_skills,
            location=body.location,
            experience=body.experience,
            job_type=body.job_type,
            status="open",
            recruiter_id=user.id,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        job.applicant_count = 0
        job.shortlisted_count = 0
        db.add(job)
        await db.commit()
        await db.refresh(job)
        job.applicant_count = 0
        job.shortlisted_count = 0
        try:
            await event_dispatcher.emit(
                "job.created",
                {
                    "job_id": str(job.id),
                    "title": job.title,
                    "company": job.company,
                    "status": job.status,
                    "recruiter_id": str(user.id),
                },
            )
        except Exception:
            pass
        return job

    async def get_job(
        self,
        db: AsyncSession,
        job_id: uuid.UUID,
    ) -> Job | None:
        job = await db.get(Job, job_id)
        if job:
            stats_stmt = (
                select(
                    func.count(Match.id).label("applicant_count"),
                    func.sum(case((Match.shortlisted == True, 1), else_=0)).label(
                        "shortlisted_count"
                    ),
                )
                .where(Match.job_id == job.id)
            )
            stats_res = (await db.execute(stats_stmt)).one_or_none()
            if stats_res:
                job.applicant_count = stats_res[0] or 0
                job.shortlisted_count = stats_res[1] or 0
            else:
                job.applicant_count = 0
                job.shortlisted_count = 0
        return job

    async def list_recruiter_jobs(
        self,
        db: AsyncSession,
        recruiter_id: uuid.UUID,
        status: str | None = None,
        skip: int = 0,
        limit: int = 20,
    ) -> list[Job]:
        stmt = select(Job).where(Job.recruiter_id == recruiter_id)
        if status:
            stmt = stmt.where(Job.status == status)
        stmt = (
            stmt.order_by(Job.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(stmt)
        jobs = list(result.scalars().all())

        if jobs:
            job_ids = [j.id for j in jobs]
            stats_stmt = (
                select(
                    Match.job_id,
                    func.count(Match.id).label("applicant_count"),
                    func.sum(case((Match.shortlisted == True, 1), else_=0)).label(
                        "shortlisted_count"
                    ),
                )
                .where(Match.job_id.in_(job_ids))
                .group_by(Match.job_id)
            )
            stats_result = await db.execute(stats_stmt)
            counts_map = {
                row[0]: (row[1] or 0, row[2] or 0)
                for row in stats_result.all()
            }
            for j in jobs:
                app_count, short_count = counts_map.get(j.id, (0, 0))
                j.applicant_count = app_count
                j.shortlisted_count = short_count

        return jobs

    async def list_public_jobs(
        self,
        db: AsyncSession,
        search: str | None = None,
        location: str | None = None,
        job_type: str | None = None,
        experience: str | None = None,
        company: str | None = None,
        skill: str | None = None,
        skip: int = 0,
        limit: int = 20,
    ) -> list[Job]:
        stmt = select(Job).where(
            Job.status == "open",
            Job.is_taken_down.is_(False),
        )

        if search:
            term = f"%{search.strip()}%"
            stmt = stmt.where(
                or_(
                    Job.title.ilike(term),
                    Job.company.ilike(term),
                    Job.description.ilike(term),
                )
            )

        if location:
            stmt = stmt.where(Job.location.ilike(f"%{location.strip()}%"))

        if job_type:
            stmt = stmt.where(func.lower(Job.job_type) == job_type.strip().lower())

        if experience:
            stmt = stmt.where(Job.experience.ilike(f"%{experience.strip()}%"))

        if company:
            stmt = stmt.where(Job.company.ilike(f"%{company.strip()}%"))

        if skill:
            stmt = stmt.where(cast(Job.skills, String).ilike(f"%{skill.strip()}%"))

        stmt = (
            stmt.order_by(Job.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def update_job(
        self,
        db: AsyncSession,
        job: Job,
        user: User,
        body: JobUpdate,
    ) -> Job:
        ensure_job_access(job, user)

        text_changed = False

        if body.title is not None and body.title != job.title:
            job.title = body.title
            text_changed = True

        if body.company is not None and body.company != job.company:
            job.company = body.company
            text_changed = True

        if body.description is not None and body.description != job.description:
            job.description = body.description
            text_changed = True

        if body.required_skills is not None:
            job.required_skills = body.required_skills
            text_changed = True

        if body.location is not None:
            job.location = body.location

        if body.experience is not None:
            job.experience = body.experience

        if body.job_type is not None:
            job.job_type = body.job_type

        if body.status is not None:
            job.status = body.status

        if text_changed:
            job_text = self._build_job_text(
                title=job.title,
                company=job.company,
                description=job.description,
                required_skills=job.required_skills,
            )
            job.embedding = await self.embedding_service.get_embedding(job_text)
            job.extracted_skills = await self.skill_service.extract_skills(job_text)
            job.skills = merge_skills(job.required_skills, job.extracted_skills)

        job.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(job)
        try:
            await event_dispatcher.emit(
                "job.updated",
                {
                    "job_id": str(job.id),
                    "title": job.title,
                    "company": job.company,
                    "status": job.status,
                    "recruiter_id": str(user.id),
                },
            )
        except Exception:
            pass
        return await self.get_job(db, job.id) or job

    async def close_job(
        self,
        db: AsyncSession,
        job: Job,
        user: User,
    ) -> Job:
        ensure_job_access(job, user)
        job.status = "closed"
        job.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(job)
        try:
            await event_dispatcher.emit(
                "job.closed",
                {
                    "job_id": str(job.id),
                    "title": job.title,
                    "company": job.company,
                    "status": job.status,
                    "recruiter_id": str(user.id),
                },
            )
        except Exception:
            pass
        return await self.get_job(db, job.id) or job

    async def delete_job(
        self,
        db: AsyncSession,
        job: Job,
        user: User,
    ) -> None:
        ensure_job_access(job, user)
        await db.delete(job)
        await db.commit()
