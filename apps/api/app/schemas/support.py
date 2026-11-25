import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class SupportThreadCreate(BaseModel):
    subject: str = Field(..., min_length=3, max_length=255)
    category: str = Field(default="general", max_length=50)
    message: str = Field(..., min_length=1, max_length=5000)


class SupportMessageCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000)


class SupportThreadStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(open|resolved)$")


class SupportMessageResponse(BaseModel):
    id: uuid.UUID
    thread_id: uuid.UUID
    sender_id: uuid.UUID
    sender_role: str
    sender_name: str
    content: str
    created_at: datetime


class SupportThreadResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_role: str
    user_name: str
    user_email: str
    subject: str
    category: str
    status: str
    created_at: datetime
    updated_at: datetime
    messages: list[SupportMessageResponse] = []
    message_count: int = 0


class SupportThreadListResponse(BaseModel):
    items: list[SupportThreadResponse]
    total: int
    open_count: int = 0
    resolved_count: int = 0
