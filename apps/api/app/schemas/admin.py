import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class AdminMetricsResponse(BaseModel):
    total_candidates: int = 0
    total_recruiters: int = 0
    total_jobs: int = 0
    open_jobs: int = 0
    closed_jobs: int = 0
    total_applications: int = 0
    total_shortlisted: int = 0
    open_support_tickets: int = 0
    resolved_support_tickets: int = 0


class UserStatusUpdate(BaseModel):
    is_active: bool


class AdminUserItem(BaseModel):
    id: uuid.UUID
    role: str
    full_name: str
    email: str
    phone_number: str | None = None
    age: int | None = None
    gender: str | None = None
    is_active: bool
    created_at: datetime
    company_name: str | None = None
    industry: str | None = None
    resumes_count: int = 0
    jobs_count: int = 0
    applications_count: int = 0


class AdminUsersListResponse(BaseModel):
    items: list[AdminUserItem]
    total: int
    page: int
    page_size: int
    has_more: bool


class JobTakedownRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=1000)


class AdminJobItem(BaseModel):
    id: uuid.UUID
    title: str
    company: str
    status: str
    is_taken_down: bool = False
    takedown_reason: str | None = None
    recruiter_id: uuid.UUID | None = None
    recruiter_name: str | None = None
    recruiter_email: str | None = None
    applicant_count: int = 0
    shortlisted_count: int = 0
    created_at: datetime | None = None


class AdminJobsListResponse(BaseModel):
    items: list[AdminJobItem]
    total: int
    page: int
    page_size: int
    has_more: bool


class AdminApplicationItem(BaseModel):
    id: uuid.UUID
    job_id: uuid.UUID
    candidate_id: uuid.UUID
    job_title: str
    job_company: str
    candidate_name: str
    candidate_email: str
    status: str
    final_score: float | None = None
    similarity_score: float | None = None
    trust_score: float | None = None
    readiness_score: float | None = None
    created_at: datetime


class AdminApplicationsListResponse(BaseModel):
    items: list[AdminApplicationItem]
    total: int
    page: int
    page_size: int
    has_more: bool


class AdminLoginRequest(BaseModel):
    id: str | None = None
    admin_id: str | None = None
    password: str

    def get_identifier(self) -> str:
        ident = self.id or self.admin_id
        if not ident or not ident.strip():
            raise ValueError("Admin ID is required")
        return ident.strip()


class AdminLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    admin: dict


class AdminCandidateUpdate(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=255)
    email: str = Field(..., min_length=3, max_length=255)
    phone_number: str | None = None
    age: int | None = Field(None, ge=18, le=100)
    gender: str | None = None


class AdminRecruiterCreate(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=255)
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=6, max_length=128)
    phone_number: str | None = None
    company_name: str = Field(..., min_length=1, max_length=255)
    industry: str | None = None
    company_size: str | None = None
    company_website: str | None = None


class AdminRecruiterUpdate(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=255)
    email: str = Field(..., min_length=3, max_length=255)
    phone_number: str | None = None
    company_name: str | None = None
    industry: str | None = None
    company_size: str | None = None
    company_website: str | None = None


class AdminResetPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=6, max_length=128)


class AdminJobUpdate(BaseModel):
    title: str | None = None
    company: str | None = None
    description: str | None = None
    location: str | None = None
    experience: str | None = None
    job_type: str | None = None
    required_skills: list[str] | None = None
    status: str | None = None


class AdminJobStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(open|closed)$")


class AdminShortlistedItem(BaseModel):
    id: uuid.UUID
    application_id: uuid.UUID
    job_id: uuid.UUID
    job_title: str
    job_company: str
    recruiter_id: uuid.UUID | None = None
    recruiter_name: str | None = None
    recruiter_email: str | None = None
    candidate_id: uuid.UUID | None = None
    candidate_name: str = "Unknown Candidate"
    candidate_email: str = ""
    candidate_phone: str | None = None
    status: str = "shortlisted"
    similarity_score: float | None = None
    trust_score: float | None = None
    readiness_score: float | None = None
    final_score: float | None = None
    created_at: datetime | None = None


class AdminShortlistedListResponse(BaseModel):
    items: list[AdminShortlistedItem]
    total: int
    page: int
    page_size: int
    has_more: bool
