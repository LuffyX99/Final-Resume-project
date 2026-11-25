import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import ensure_resume_access, get_current_user, require_role
from app.models import Job, Match, Resume, User
from app.ratelimit import limiter
from app.schemas import MatchResponse, ResumeCreate, ResumeResponse
from app.services.embedding import EmbeddingService
from app.services.resume_upload import ResumeUploadError, read_resume_upload
from app.services.skill_extraction import SkillExtractionService

router = APIRouter(prefix="/api/resumes", tags=["resumes"])

embedding_service = EmbeddingService()
skill_service = SkillExtractionService()


@router.post("", response_model=ResumeResponse, status_code=201)
@limiter.limit("30/minute")
async def create_resume(
    request: Request,
    body: ResumeCreate,
    user: User = Depends(require_role("candidate", "recruiter", "admin")),
    db: AsyncSession = Depends(get_db),
):
    embedding = await embedding_service.get_embedding(body.content)
    skills = await skill_service.extract_skills(body.content)
    resume = Resume(
        candidate_name=_owner_name(body.candidate_name, user),
        content=body.content,
        embedding=embedding,
        skills=skills,
        candidate_id=user.id if user.role == "candidate" else None,
    )
    db.add(resume)
    await db.commit()
    await db.refresh(resume)
    return resume


@router.post("/upload", response_model=ResumeResponse, status_code=201)
@limiter.limit("10/minute")
async def upload_resume(
    request: Request,
    candidate_name: str = Form(...),
    file: UploadFile = File(...),
    user: User = Depends(require_role("candidate", "recruiter", "admin")),
    db: AsyncSession = Depends(get_db),
):
    try:
        upload = await read_resume_upload(file)
    except ResumeUploadError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))

    embedding = await embedding_service.get_embedding(upload.content)
    skills = await skill_service.extract_skills(upload.content)
    resume = Resume(
        candidate_name=_owner_name(candidate_name, user),
        content=upload.content,
        embedding=embedding,
        skills=skills,
        file_name=upload.filename,
        candidate_id=user.id if user.role == "candidate" else None,
    )
    db.add(resume)
    await db.commit()
    await db.refresh(resume)
    return resume


@router.get("", response_model=list[ResumeResponse])
async def list_resumes(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Resume).order_by(Resume.created_at.desc())
    if user.role == "candidate":
        stmt = stmt.where(Resume.candidate_id == user.id)
    elif user.role == "recruiter":
        stmt = stmt.where(Resume.candidate_id.is_(None))
    stmt = stmt.offset(skip).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{resume_id}", response_model=ResumeResponse)
async def get_resume(
    resume_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    resume = await db.get(Resume, resume_id)
    if resume is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    ensure_resume_access(resume, user)
    return resume


@router.get("/{resume_id}/matches", response_model=list[MatchResponse])
async def get_resume_matches(
    resume_id: uuid.UUID,
    limit: int = Query(10, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    resume = await db.get(Resume, resume_id)
    if resume is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    ensure_resume_access(resume, user)

    stmt = (
        select(
            Match.id,
            Match.job_id,
            Match.resume_id,
            Match.similarity_score,
            Match.bias_reduced,
            Match.created_at,
            Job.title.label("job_title"),
            Job.company.label("job_company"),
        )
        .join(Job, Match.job_id == Job.id)
        .where(Match.resume_id == resume_id)
        .order_by(Match.similarity_score.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    return [
        MatchResponse(
            id=row.id,
            job_id=row.job_id,
            resume_id=row.resume_id,
            similarity_score=row.similarity_score,
            bias_reduced=row.bias_reduced,
            created_at=row.created_at,
            job_title=row.job_title,
            job_company=row.job_company,
        )
        for row in rows
    ]


def _owner_name(submitted_name: str, user: User) -> str:
    """Candidates cannot post a resume under someone else's name."""
    return user.full_name if user.role == "candidate" else submitted_name
