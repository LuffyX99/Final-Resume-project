import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SupportThread(Base):
    __tablename__ = "support_threads"
    __table_args__ = (
        Index("ix_support_threads_status_created", "status", "created_at"),
        Index("ix_support_threads_user", "user_id", "created_at"),
        CheckConstraint("status IN ('open', 'resolved')", name="ck_support_threads_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    user_role: Mapped[str] = mapped_column(String(20), nullable=False)
    user_name: Mapped[str] = mapped_column(String(255), nullable=False)
    user_email: Mapped[str] = mapped_column(String(320), nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(
        String(50), default="general", nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(20), default="open", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user: Mapped["User"] = relationship()  # noqa: F821
    messages: Mapped[list["SupportMessage"]] = relationship(
        back_populates="thread",
        cascade="all, delete-orphan",
        order_by="SupportMessage.created_at",
    )


class SupportMessage(Base):
    __tablename__ = "support_messages"
    __table_args__ = (
        Index("ix_support_messages_thread_created", "thread_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    thread_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("support_threads.id", ondelete="CASCADE"), nullable=False
    )
    sender_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    sender_role: Mapped[str] = mapped_column(String(20), nullable=False)
    sender_name: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    thread: Mapped["SupportThread"] = relationship(back_populates="messages")
    sender: Mapped["User"] = relationship()  # noqa: F821
