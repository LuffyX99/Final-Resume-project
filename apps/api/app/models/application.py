import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    JSON,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

APPLICATION_STATUSES = (
    "submitted",
    "shortlisted",
    "rejected",
    "hired",
    "withdrawn",
)
TERMINAL_APPLICATION_STATUSES = {"rejected", "hired", "withdrawn"}


class Application(Base):
    """A candidate's submitted application to one job.

    The resume text lives on ``resumes``; this row stores the application
    snapshot (contact details at submission time) and its lifecycle status.
    """

    __tablename__ = "applications"
    __table_args__ = (
        UniqueConstraint(
            "candidate_id", "job_id", name="uq_applications_candidate_job"
        ),
        Index(
            "ix_applications_candidate_created",
            "candidate_id",
            "created_at",
        ),
        Index("ix_applications_job_status", "job_id", "status"),
        Index("ix_applications_job_final_score", "job_id", "final_score"),
        CheckConstraint(
            "status IN ('submitted', 'shortlisted', 'rejected', 'hired', 'withdrawn')",
            name="ck_applications_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    candidate_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False
    )
    resume_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("resumes.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(20), default="submitted", nullable=False
    )

    applicant_name: Mapped[str] = mapped_column(String(255), nullable=False)
    applicant_email: Mapped[str] = mapped_column(String(320), nullable=False)
    applicant_phone_number: Mapped[str | None] = mapped_column(
        String(32), nullable=True
    )
    applicant_age: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    applicant_gender: Mapped[str | None] = mapped_column(String(32), nullable=True)

    similarity_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    trust_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    trust_flags: Mapped[list[dict] | None] = mapped_column(
        JSON, nullable=True, default=list
    )
    final_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    readiness_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    skill_gap_analysis: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    audit_trail: Mapped[list[dict] | None] = mapped_column(
        JSON, nullable=True, default=list
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
