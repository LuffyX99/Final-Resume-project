import uuid
from datetime import datetime, timezone

from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (
        Index("ix_jobs_status_created_at", "status", "created_at"),
        Index("ix_jobs_recruiter_status", "recruiter_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255))
    company: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text)
    embedding = mapped_column(Vector(384), nullable=True)
    skills = mapped_column(JSON, nullable=True)
    required_skills = mapped_column(JSON, nullable=True)
    extracted_skills = mapped_column(JSON, nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    experience: Mapped[str | None] = mapped_column(String(100), nullable=True)
    job_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="open", nullable=False)
    is_taken_down: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    takedown_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    recruiter_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=True,
    )

    recruiter: Mapped["User | None"] = relationship(  # noqa: F821
        back_populates="jobs"
    )
    matches: Mapped[list["Match"]] = relationship(
        back_populates="job", cascade="all, delete-orphan"
    )  # noqa: F821
