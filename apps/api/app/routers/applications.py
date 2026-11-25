import uuid

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import require_role
from app.ratelimit import limiter
from app.models import Application, Job, Match, Resume, User
from app.schemas import (
    ApplicationResponse,
    ApplicationResumeSummary,
    JobResponse,
    MatchResponse,
    ShortlistOverrideRequest,
    SkillGapResponse,
)
from app.services.application_pipeline import (
    ApplicationPipelineService,
    PipelineError,
    application_pipeline,
)
from app.services.application_service import (
    ApplicationError,
    ApplicationService,
)
from app.services.resume_upload import ResumeUploadError, read_resume_upload
from app.services.skill_gap import SkillGapService

router = APIRouter(prefix="/api/applications", tags=["applications"])

application_service = ApplicationService()


def _match_response(
    match: Match | None,
    job: Job,
    resume: Resume,
    application: Application | None = None,
) -> MatchResponse | None:
    if match is None:
        return None
    return MatchResponse(
        id=match.id,
        job_id=match.job_id,
        resume_id=match.resume_id,
        similarity_score=match.similarity_score,
        trust_score=application.trust_score if application else None,
        final_score=application.final_score if application else None,
        trust_flags=application.trust_flags if application else None,
        readiness_score=application.readiness_score if application else None,
        skill_gap_analysis=application.skill_gap_analysis if application else None,
        bias_reduced=match.bias_reduced,
        shortlisted=match.shortlisted,
        created_at=match.created_at,
        job_title=job.title,
        job_company=job.company,
        candidate_name=resume.candidate_name,
        candidate_skills=resume.skills,
    )


def _application_response(
    application: Application,
    job: Job,
    resume: Resume,
    match: Match | None,
) -> ApplicationResponse:
    return ApplicationResponse(
        id=application.id,
        job_id=application.job_id,
        candidate_id=application.candidate_id,
        resume_id=application.resume_id,
        status=application.status,
        applicant_name=application.applicant_name,
        applicant_email=application.applicant_email,
        applicant_phone_number=application.applicant_phone_number,
        applicant_age=application.applicant_age,
        applicant_gender=application.applicant_gender,
        similarity_score=application.similarity_score,
        trust_score=application.trust_score,
        trust_flags=application.trust_flags,
        final_score=application.final_score,
        readiness_score=application.readiness_score,
        skill_gap_analysis=application.skill_gap_analysis,
        audit_trail=application.audit_trail,
        created_at=application.created_at,
        updated_at=application.updated_at,
        job=JobResponse.model_validate(job),
        resume=ApplicationResumeSummary.model_validate(resume),
        match=_match_response(match, job, resume, application),
    )


@router.post(
    "",
    response_model=ApplicationResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("20/minute")
async def submit_application(
    request: Request,
    job_id: uuid.UUID = Form(...),
    full_name: str = Form(..., min_length=2, max_length=255),
    phone_number: str = Form(..., max_length=32),
    age: int = Form(..., ge=18, le=100),
    gender: str = Form(..., min_length=1, max_length=32),
    file: UploadFile = File(...),
    user: User = Depends(require_role("candidate")),
    db: AsyncSession = Depends(get_db),
):
    try:
        upload = await read_resume_upload(file)
    except ResumeUploadError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))

    try:
        submission = await application_service.submit_application(
            db,
            user=user,
            job_id=job_id,
            full_name=full_name,
            phone_number=phone_number,
            age=age,
            gender=gender,
            resume_content=upload.content,
            resume_filename=upload.filename,
            resume_bytes=upload.raw_bytes,
        )
    except ApplicationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))

    return _application_response(
        submission.application,
        submission.job,
        submission.resume,
        submission.match,
    )


@router.get("/mine", response_model=list[ApplicationResponse])
async def list_my_applications(
    job_id: uuid.UUID | None = Query(None),
    user: User = Depends(require_role("candidate")),
    db: AsyncSession = Depends(get_db),
):
    rows = await application_service.list_for_candidate(
        db, candidate_id=user.id, job_id=job_id
    )
    return [
        _application_response(application, job, resume, match)
        for application, job, resume, match in rows
    ]


@router.get("/{id}/readiness", response_model=SkillGapResponse)
async def get_application_readiness(
    id: uuid.UUID,
    user: User = Depends(require_role("candidate", "recruiter", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve skill gap & readiness analysis for an application."""
    application = await db.get(Application, id)
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found")

    # Authorize: candidate must own the application, or recruiter/admin must have job access
    if user.role == "candidate" and application.candidate_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    if user.role == "recruiter":
        job = await db.get(Job, application.job_id)
        if job is None or (job.recruiter_id is not None and job.recruiter_id != user.id):
            raise HTTPException(status_code=403, detail="Forbidden")

    analysis_dict = application.skill_gap_analysis
    if not analysis_dict:
        job = await db.get(Job, application.job_id)
        resume = await db.get(Resume, application.resume_id)
        if job and resume:
            gap_service = SkillGapService()
            gap = gap_service.analyze(
                required_skills=job.required_skills or [],
                extracted_skills=job.extracted_skills or job.skills or [],
                candidate_skills=resume.skills or [],
                resume_text=resume.content,
                similarity_score=application.similarity_score or 0.0,
            )
            application.readiness_score = gap.readiness_score
            application.skill_gap_analysis = gap.to_dict()
            await db.commit()
            analysis_dict = application.skill_gap_analysis

    if not analysis_dict:
        return SkillGapResponse()

    return SkillGapResponse(**analysis_dict)


@router.post(
    "/{id}/shortlist-override",
    response_model=ApplicationResponse,
)
async def override_application_shortlist(
    id: uuid.UUID,
    body: ShortlistOverrideRequest,
    user: User = Depends(require_role("recruiter", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Allow recruiter/admin to manually override shortlist decision with an audit trail."""
    try:
        application = await application_pipeline.override_shortlist(
            db,
            application_id=id,
            recruiter=user,
            shortlisted=body.shortlisted,
            reason=body.reason,
        )
    except PipelineError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))

    job = await db.get(Job, application.job_id)
    resume = await db.get(Resume, application.resume_id)
    match = (
        await db.execute(
            select(Match).where(
                Match.job_id == application.job_id,
                Match.resume_id == application.resume_id,
            )
        )
    ).scalar_one_or_none()
    return _application_response(application, job, resume, match)

