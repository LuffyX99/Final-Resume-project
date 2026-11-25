import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import ensure_job_access, get_current_user, require_role
from app.models import Application, Job, Match, Resume, User
from app.schemas import (
    ApplicationDetailResponse,
    JobCreate,
    JobResponse,
    JobUpdate,
    MatchResponse,
    ResumeResponse,
)
from app.services.embedding import EmbeddingService
from app.services.job_service import JobService
from app.services.skill_extraction import SkillExtractionService

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

embedding_service = EmbeddingService()
skill_service = SkillExtractionService()
job_service = JobService(
    embedding_service=embedding_service,
    skill_service=skill_service,
)


@router.post("", response_model=JobResponse, status_code=status.HTTP_201_CREATED)
async def create_job(
    body: JobCreate,
    user: User = Depends(require_role("recruiter", "admin")),
    db: AsyncSession = Depends(get_db),
):
    return await job_service.create_job(db=db, user=user, body=body)


@router.get("", response_model=list[JobResponse])
async def list_jobs(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.role == "recruiter":
        return await job_service.list_recruiter_jobs(
            db=db, recruiter_id=user.id, skip=skip, limit=limit
        )
    elif user.role == "candidate":
        return await job_service.list_public_jobs(
            db=db, skip=skip, limit=limit
        )

    stmt = (
        select(Job)
        .order_by(Job.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/mine", response_model=list[JobResponse])
async def list_my_jobs(
    status_filter: str | None = Query(None, alias="status", pattern="^(open|closed)$"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(require_role("recruiter", "admin")),
    db: AsyncSession = Depends(get_db),
):
    return await job_service.list_recruiter_jobs(
        db=db,
        recruiter_id=user.id,
        status=status_filter,
        skip=skip,
        limit=limit,
    )


@router.get("/public", response_model=list[JobResponse])
async def list_public_jobs(
    search: str | None = Query(None, description="Search in title, company, description"),
    location: str | None = Query(None, description="Filter by location"),
    job_type: str | None = Query(None, description="Filter by job type"),
    experience: str | None = Query(None, description="Filter by experience level"),
    company: str | None = Query(None, description="Filter by company"),
    skill: str | None = Query(None, description="Filter by skill"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    return await job_service.list_public_jobs(
        db=db,
        search=search,
        location=location,
        job_type=job_type,
        experience=experience,
        company=company,
        skill=skill,
        skip=skip,
        limit=limit,
    )


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: uuid.UUID,
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    job = await job_service.get_job(db, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.patch("/{job_id}", response_model=JobResponse)
async def update_job(
    job_id: uuid.UUID,
    body: JobUpdate,
    user: User = Depends(require_role("recruiter", "admin")),
    db: AsyncSession = Depends(get_db),
):
    job = await job_service.get_job(db, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return await job_service.update_job(
        db=db,
        job=job,
        user=user,
        body=body,
    )


@router.post("/{job_id}/close", response_model=JobResponse)
async def close_job(
    job_id: uuid.UUID,
    user: User = Depends(require_role("recruiter", "admin")),
    db: AsyncSession = Depends(get_db),
):
    job = await job_service.get_job(db, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return await job_service.close_job(
        db=db,
        job=job,
        user=user,
    )


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job(
    job_id: uuid.UUID,
    user: User = Depends(require_role("recruiter", "admin")),
    db: AsyncSession = Depends(get_db),
):
    job = await job_service.get_job(db, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    await job_service.delete_job(
        db=db,
        job=job,
        user=user,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{job_id}/matches", response_model=list[MatchResponse])
async def get_job_matches(
    job_id: uuid.UUID,
    limit: int = Query(10, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    job = await job_service.get_job(db, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    ensure_job_access(job, user)

    stmt = (
        select(
            Match.id,
            Match.job_id,
            Match.resume_id,
            Match.similarity_score,
            Match.bias_reduced,
            Match.shortlisted,
            Match.created_at,
            Resume.candidate_name,
            Resume.skills.label("candidate_skills"),
            Application.trust_score,
            Application.final_score,
            Application.trust_flags,
            Application.readiness_score,
            Application.skill_gap_analysis,
        )
        .join(Resume, Match.resume_id == Resume.id)
        .outerjoin(
            Application,
            and_(
                Application.job_id == Match.job_id,
                Application.resume_id == Match.resume_id,
            ),
        )
        .where(Match.job_id == job_id)
        .order_by(
            func.coalesce(Application.final_score, Match.similarity_score).desc(),
            Match.similarity_score.desc(),
        )
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    return [
        MatchResponse(
            id=row.id,
            job_id=row.job_id,
            resume_id=row.resume_id,
            similarity_score=row.similarity_score,
            trust_score=row.trust_score,
            final_score=row.final_score,
            trust_flags=row.trust_flags,
            readiness_score=row.readiness_score,
            skill_gap_analysis=row.skill_gap_analysis,
            bias_reduced=row.bias_reduced,
            shortlisted=row.shortlisted,
            created_at=row.created_at,
            candidate_name=row.candidate_name,
            candidate_skills=row.candidate_skills,
        )
        for row in rows
    ]


@router.get(
    "/{job_id}/applicants/{match_id}",
    response_model=ApplicationDetailResponse,
)
async def get_job_application(
    job_id: uuid.UUID,
    match_id: uuid.UUID,
    user: User = Depends(require_role("recruiter", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Read one application for a job the caller owns.

    Candidate-owned resumes are otherwise private to the candidate, so this
    endpoint authorizes access through the job/match relationship instead of
    loosening the resume endpoint.
    """
    job = await job_service.get_job(db, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    ensure_job_access(job, user)

    match = await db.get(Match, match_id)
    if match is None or match.job_id != job.id:
        raise HTTPException(status_code=404, detail="Application not found")

    resume = await db.get(Resume, match.resume_id)
    if resume is None:
        raise HTTPException(status_code=404, detail="Resume not found")

    app_record = await db.scalar(
        select(Application).where(
            Application.job_id == job.id,
            Application.resume_id == match.resume_id,
        )
    )

    return ApplicationDetailResponse(
        job=JobResponse.model_validate(job),
        match=MatchResponse(
            id=match.id,
            job_id=match.job_id,
            resume_id=match.resume_id,
            similarity_score=match.similarity_score,
            trust_score=app_record.trust_score if app_record else None,
            final_score=app_record.final_score if app_record else None,
            trust_flags=app_record.trust_flags if app_record else None,
            readiness_score=app_record.readiness_score if app_record else None,
            skill_gap_analysis=app_record.skill_gap_analysis if app_record else None,
            bias_reduced=match.bias_reduced,
            shortlisted=match.shortlisted,
            created_at=match.created_at,
            job_title=job.title,
            job_company=job.company,
            candidate_name=resume.candidate_name,
            candidate_skills=resume.skills,
        ),
        resume=ResumeResponse.model_validate(resume),
        application_id=app_record.id if app_record else None,
    )
