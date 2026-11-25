import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Match(Base):
    __tablename__ = "matches"
    __table_args__ = (
        UniqueConstraint("job_id", "resume_id", name="uq_matches_job_resume"),
        Index("ix_matches_job_score", "job_id", "similarity_score"),
        Index("ix_matches_resume_score", "resume_id", "similarity_score"),
        Index("ix_matches_job_shortlisted", "job_id", "shortlisted"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id"))
    resume_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("resumes.id"))
    similarity_score: Mapped[float] = mapped_column(Float)
    bias_reduced: Mapped[bool] = mapped_column(Boolean, default=False)
    shortlisted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    job: Mapped["Job"] = relationship(back_populates="matches")  # noqa: F821
    resume: Mapped["Resume"] = relationship(back_populates="matches")  # noqa: F821
