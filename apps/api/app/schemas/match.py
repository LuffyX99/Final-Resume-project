from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.job import JobResponse
from app.schemas.resume import ResumeResponse


class MatchResponse(BaseModel):
    id: UUID
    job_id: UUID
    resume_id: UUID
    similarity_score: float
    trust_score: float | None = None
    final_score: float | None = None
    trust_flags: list[dict] | None = None
    readiness_score: int | None = None
    skill_gap_analysis: dict | None = None
    bias_reduced: bool = False
    shortlisted: bool = False
    created_at: datetime
    job_title: str | None = None
    job_company: str | None = None
    candidate_name: str | None = None
    candidate_skills: list[str] | None = None

    model_config = {"from_attributes": True}


class MatchComputeRequest(BaseModel):
    job_id: UUID | None = None
    resume_id: UUID | None = None
    bias_reduced: bool = False


class MatchUpdate(BaseModel):
    shortlisted: bool
    reason: str = ""


class ApplicationDetailResponse(BaseModel):
    """Everything a recruiter needs to review one application.

    The resume is scoped to a match owned by the job, so it is returned here
    instead of exposing the candidate-owned resume endpoint directly.
    """

    job: JobResponse
    match: MatchResponse
    resume: ResumeResponse
    application_id: UUID | None = None
