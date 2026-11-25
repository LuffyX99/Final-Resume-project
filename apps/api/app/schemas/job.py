from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class JobCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    company: str = Field(..., min_length=1, max_length=255)
    description: str = Field(..., min_length=1)
    required_skills: list[str] = Field(default_factory=list)
    location: str | None = Field(default=None, max_length=255)
    experience: str | None = Field(default=None, max_length=100)
    job_type: str | None = Field(default=None, max_length=50)

    @field_validator("title", "company", "description", mode="before")
    @classmethod
    def strip_text(cls, v: str) -> str:
        if isinstance(v, str):
            v_stripped = v.strip()
            if not v_stripped:
                raise ValueError("Field cannot be empty or whitespace only")
            return v_stripped
        return v

    @field_validator("required_skills", mode="before")
    @classmethod
    def clean_skills(cls, v: list[str] | None) -> list[str]:
        if not v:
            return []
        cleaned: list[str] = []
        for s in v:
            if isinstance(s, str) and s.strip():
                cleaned.append(s.strip())
        return cleaned


class JobUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    company: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, min_length=1)
    required_skills: list[str] | None = None
    location: str | None = Field(default=None, max_length=255)
    experience: str | None = Field(default=None, max_length=100)
    job_type: str | None = Field(default=None, max_length=50)
    status: str | None = Field(default=None, pattern="^(open|closed)$")

    @field_validator(
        "title",
        "company",
        "description",
        "location",
        "experience",
        "job_type",
        mode="before",
    )
    @classmethod
    def strip_text_optional(cls, v: str | None) -> str | None:
        if isinstance(v, str):
            v_stripped = v.strip()
            if not v_stripped:
                raise ValueError("Field cannot be empty or whitespace only")
            return v_stripped
        return v

    @field_validator("required_skills", mode="before")
    @classmethod
    def clean_skills_optional(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        cleaned: list[str] = []
        for s in v:
            if isinstance(s, str) and s.strip():
                cleaned.append(s.strip())
        return cleaned


class JobResponse(BaseModel):
    id: UUID
    title: str
    company: str
    description: str
    skills: list[str] | None = None
    required_skills: list[str] = Field(default_factory=list)
    extracted_skills: list[str] = Field(default_factory=list)
    location: str | None = None
    experience: str | None = None
    job_type: str | None = None
    status: str = "open"
    recruiter_id: UUID | None = None
    applicant_count: int = 0
    shortlisted_count: int = 0
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}

    @field_validator("required_skills", "extracted_skills", mode="before")
    @classmethod
    def default_none_to_list(cls, v: list[str] | None) -> list[str]:
        if v is None:
            return []
        return v
