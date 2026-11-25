import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Index,
    SmallInteger,
    String,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        Index("ux_users_email_lower", text("lower(email)"), unique=True),
        Index("ix_users_role_active", "role", "is_active"),
        CheckConstraint(
            "role IN ('candidate', 'recruiter', 'admin')", name="ck_users_role"
        ),
        CheckConstraint(
            "age IS NULL OR (age >= 18 AND age <= 100)", name="ck_users_age"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    role: Mapped[str] = mapped_column(String(20), default="candidate")
    full_name: Mapped[str] = mapped_column(String(255))
    age: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(32), nullable=True)
    email: Mapped[str] = mapped_column(String(320))
    phone_number: Mapped[str | None] = mapped_column(String(32), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    recruiter_profile: Mapped["RecruiterProfile | None"] = relationship(  # noqa: F821
        back_populates="user", uselist=False
    )
    jobs: Mapped[list["Job"]] = relationship(back_populates="recruiter")  # noqa: F821
    resumes: Mapped[list["Resume"]] = relationship(  # noqa: F821
        back_populates="candidate"
    )
