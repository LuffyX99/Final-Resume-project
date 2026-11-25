import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import ensure_job_access, ensure_resume_access, get_current_user, require_role
from app.models import Application, Job, Match, Resume, User
from app.models.application import TERMINAL_APPLICATION_STATUSES
from app.schemas import MatchComputeRequest, MatchResponse, MatchUpdate
from app.services.application_pipeline import application_pipeline
from app.services.matching import MatchingService

router = APIRouter(prefix="/api/matches", tags=["matches"])


@router.post("/compute", response_model=list[MatchResponse], status_code=201)
async def compute_matches(
    body: MatchComputeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.job_id is None and body.resume_id is None:
        raise HTTPException(
            status_code=400,
            detail="Either job_id or resume_id must be provided",
        )

    service = MatchingService(db)
    try:
        if body.job_id is not None:
            job = await db.get(Job, body.job_id)
            if job is None:
                raise HTTPException(status_code=404, detail="Job not found")
            ensure_job_access(job, user)
            matches = await service.compute_matches(
                body.job_id, bias_reduced=body.bias_reduced
            )
        else:
            resume = await db.get(Resume, body.resume_id)
            if resume is None:
                raise HTTPException(status_code=404, detail="Resume not found")
            ensure_resume_access(resume, user)
            matches = await service.compute_matches_for_resume(
                body.resume_id, bias_reduced=body.bias_reduced
            )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    await db.commit()

    results: list[MatchResponse] = []
    for m in matches:
        await db.refresh(m)
        job = await db.get(Job, m.job_id)
        resume = await db.get(Resume, m.resume_id)
        results.append(
            MatchResponse(
                id=m.id,
                job_id=m.job_id,
                resume_id=m.resume_id,
                similarity_score=m.similarity_score,
                bias_reduced=m.bias_reduced,
                shortlisted=m.shortlisted,
                created_at=m.created_at,
                job_title=job.title if job else None,
                job_company=job.company if job else None,
                candidate_name=resume.candidate_name if resume else None,
                candidate_skills=resume.skills if resume else None,
            )
        )
    return results


@router.get("", response_model=list[MatchResponse])
async def list_matches(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    job_id: str | None = Query(None),
    resume_id: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(
            Match.id,
            Match.job_id,
            Match.resume_id,
            Match.similarity_score,
            Match.bias_reduced,
            Match.shortlisted,
            Match.created_at,
            Job.title.label("job_title"),
            Job.company.label("job_company"),
            Resume.candidate_name,
            Resume.skills.label("candidate_skills"),
        )
        .join(Job, Match.job_id == Job.id)
        .join(Resume, Match.resume_id == Resume.id)
        .order_by(Match.created_at.desc())
    )

    if user.role == "candidate":
        stmt = stmt.where(
            Match.resume_id.in_(select(Resume.id).where(Resume.candidate_id == user.id))
        )
    elif user.role == "recruiter":
        stmt = stmt.where(
            Match.job_id.in_(select(Job.id).where(Job.recruiter_id == user.id))
        )

    if job_id is not None:
        stmt = stmt.where(Match.job_id == job_id)
    if resume_id is not None:
        stmt = stmt.where(Match.resume_id == resume_id)

    stmt = stmt.offset(skip).limit(limit)
    rows = (await db.execute(stmt)).all()

    return [
        MatchResponse(
            id=row.id,
            job_id=row.job_id,
            resume_id=row.resume_id,
            similarity_score=row.similarity_score,
            bias_reduced=row.bias_reduced,
            shortlisted=row.shortlisted,
            created_at=row.created_at,
            job_title=row.job_title,
            job_company=row.job_company,
            candidate_name=row.candidate_name,
            candidate_skills=row.candidate_skills,
        )
        for row in rows
    ]


@router.patch("/{match_id}", response_model=MatchResponse)
async def update_match(
    match_id: uuid.UUID,
    body: MatchUpdate,
    user: User = Depends(require_role("recruiter", "admin")),
    db: AsyncSession = Depends(get_db),
):
    match = await db.get(Match, match_id)
    if match is None:
        raise HTTPException(status_code=404, detail="Match not found")

    job = await db.get(Job, match.job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    ensure_job_access(job, user)

    # Keep the candidate-visible application status in step with the
    # recruiter's shortlist action and audit the override. Legacy computed matches
    # have no application row, so this update is optional.
    application = (
        await db.execute(
            select(Application).where(
                Application.job_id == match.job_id,
                Application.resume_id == match.resume_id,
            )
        )
    ).scalar_one_or_none()
    if (
        application is not None
        and application.status not in TERMINAL_APPLICATION_STATUSES
    ):
        await application_pipeline.override_shortlist(
            db,
            application_id=application.id,
            recruiter=user,
            shortlisted=body.shortlisted,
            reason=body.reason,
        )
    else:
        match.shortlisted = body.shortlisted
        await db.commit()

    await db.refresh(match)

    resume = await db.get(Resume, match.resume_id)
    return MatchResponse(
        id=match.id,
        job_id=match.job_id,
        resume_id=match.resume_id,
        similarity_score=match.similarity_score,
        bias_reduced=match.bias_reduced,
        shortlisted=match.shortlisted,
        created_at=match.created_at,
        job_title=job.title,
        job_company=job.company,
        candidate_name=resume.candidate_name if resume else None,
        candidate_skills=resume.skills if resume else None,
    )
