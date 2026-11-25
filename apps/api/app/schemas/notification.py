from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class InterviewInviteRequest(BaseModel):
    application_id: UUID | None = None
    match_id: UUID | None = None
    venue: str = Field(..., min_length=2, max_length=500)
    interview_date: str = Field(..., min_length=2, max_length=100)
    interview_time: str = Field(default="", max_length=100)
    mode: str = Field(default="online", max_length=50)
    contact_person: str = Field(..., min_length=2, max_length=255)
    notes: str = Field(default="", max_length=2000)


class NotificationResponse(BaseModel):
    id: UUID
    user_id: UUID
    sender_id: UUID | None = None
    job_id: UUID
    application_id: UUID | None = None
    title: str
    content: str
    notification_type: str
    details: dict | None = None
    is_read: bool
    read_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    unread_count: int
