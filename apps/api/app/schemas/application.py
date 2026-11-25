from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.job import JobResponse
from app.schemas.match import MatchResponse


class LearningStepResponse(BaseModel):
    skill: str
    status: str
    priority: int = 1
    title: str
    action: str
    resource_hint: str = ""
    estimated_time: str = ""


class SkillGapResponse(BaseModel):
    matched_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    stale_skills: list[str] = Field(default_factory=list)
    critical_missing_skills: list[str] = Field(default_factory=list)
    readiness_score: int = 0
    learning_steps: list[LearningStepResponse] = Field(default_factory=list)


class ApplicationResumeSummary(BaseModel):
    id: UUID
    candidate_name: str
    file_name: str | None = None
    skills: list[str] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ApplicationResponse(BaseModel):
    id: UUID
    job_id: UUID
    candidate_id: UUID
    resume_id: UUID
    status: str

    applicant_name: str
    applicant_email: str
    applicant_phone_number: str | None = None
    applicant_age: int | None = None
    applicant_gender: str | None = None

    similarity_score: float | None = None
    trust_score: float | None = None
    trust_flags: list[dict] | None = None
    final_score: float | None = None
    readiness_score: int | None = None
    skill_gap_analysis: SkillGapResponse | None = None
    audit_trail: list[dict] | None = None

    created_at: datetime
    updated_at: datetime

    job: JobResponse
    resume: ApplicationResumeSummary
    match: MatchResponse | None = None


class ShortlistOverrideRequest(BaseModel):
    shortlisted: bool
    reason: str = ""

