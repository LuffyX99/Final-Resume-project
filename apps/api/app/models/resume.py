import uuid
from datetime import datetime, timezone

from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Resume(Base):
    __tablename__ = "resumes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    candidate_name: Mapped[str] = mapped_column(String(255))
    content: Mapped[str] = mapped_column(Text)
    embedding = mapped_column(Vector(384), nullable=True)
    skills = mapped_column(JSON, nullable=True)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    candidate_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    candidate: Mapped["User | None"] = relationship(  # noqa: F821
        back_populates="resumes"
    )
    matches: Mapped[list["Match"]] = relationship(back_populates="resume")  # noqa: F821
