import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Notification, SupportMessage, SupportThread, User
from app.schemas.support import (
    SupportMessageResponse,
    SupportThreadListResponse,
    SupportThreadResponse,
)
from app.services.events import event_dispatcher


class SupportService:
    @staticmethod
    async def create_thread(
        db: AsyncSession,
        user: User,
        subject: str,
        category: str,
        message: str,
    ) -> SupportThreadResponse:
        now = datetime.now(timezone.utc)
        thread = SupportThread(
            id=uuid.uuid4(),
            user_id=user.id,
            user_role=user.role,
            user_name=user.full_name,
            user_email=user.email,
            subject=subject.strip(),
            category=category.strip().lower() if category else "general",
            status="open",
            created_at=now,
            updated_at=now,
        )
        db.add(thread)
        await db.flush()

        first_msg = SupportMessage(
            id=uuid.uuid4(),
            thread_id=thread.id,
            sender_id=user.id,
            sender_role=user.role,
            sender_name=user.full_name,
            content=message.strip(),
            created_at=now,
        )
        db.add(first_msg)
        await db.commit()
        await db.refresh(thread)
        await db.refresh(first_msg)

        try:
            await event_dispatcher.emit(
                "support.thread_created",
                {
                    "thread_id": str(thread.id),
                    "user_id": str(thread.user_id),
                    "user_name": thread.user_name,
                    "subject": thread.subject,
                    "category": thread.category,
                },
            )
        except Exception:
            pass

        msg_resp = SupportMessageResponse(
            id=first_msg.id,
            thread_id=first_msg.thread_id,
            sender_id=first_msg.sender_id,
            sender_role=first_msg.sender_role,
            sender_name=first_msg.sender_name,
            content=first_msg.content,
            created_at=first_msg.created_at,
        )

        return SupportThreadResponse(
            id=thread.id,
            user_id=thread.user_id,
            user_role=thread.user_role,
            user_name=thread.user_name,
            user_email=thread.user_email,
            subject=thread.subject,
            category=thread.category,
            status=thread.status,
            created_at=thread.created_at,
            updated_at=thread.updated_at,
            messages=[msg_resp],
            message_count=1,
        )

    @staticmethod
    async def list_threads(
        db: AsyncSession,
        user: User,
        status: str | None = None,
        search: str | None = None,
    ) -> SupportThreadListResponse:
        query = select(SupportThread)

        if user.role != "admin":
            query = query.where(SupportThread.user_id == user.id)

        if status:
            query = query.where(SupportThread.status == status)

        if search and search.strip():
            term = f"%{search.strip()}%"
            query = query.where(
                or_(
                    SupportThread.subject.ilike(term),
                    SupportThread.user_name.ilike(term),
                    SupportThread.user_email.ilike(term),
                )
            )

        query = query.order_by(SupportThread.updated_at.desc())
        res = await db.execute(query)
        threads = res.scalars().all()

        # Count open and resolved
        base_count_q = select(SupportThread)
        if user.role != "admin":
            base_count_q = base_count_q.where(SupportThread.user_id == user.id)

        open_q = select(func.count(SupportThread.id)).select_from(
            base_count_q.where(SupportThread.status == "open").subquery()
        )
        resolved_q = select(func.count(SupportThread.id)).select_from(
            base_count_q.where(SupportThread.status == "resolved").subquery()
        )

        res_open = await db.execute(open_q)
        res_resolved = await db.execute(resolved_q)
        open_count = res_open.scalar() or 0
        resolved_count = res_resolved.scalar() or 0

        items: list[SupportThreadResponse] = []
        for t in threads:
            msg_count_q = select(func.count(SupportMessage.id)).where(
                SupportMessage.thread_id == t.id
            )
            res_mc = await db.execute(msg_count_q)
            mc = res_mc.scalar() or 0

            items.append(
                SupportThreadResponse(
                    id=t.id,
                    user_id=t.user_id,
                    user_role=t.user_role,
                    user_name=t.user_name,
                    user_email=t.user_email,
                    subject=t.subject,
                    category=t.category,
                    status=t.status,
                    created_at=t.created_at,
                    updated_at=t.updated_at,
                    messages=[],
                    message_count=mc,
                )
            )

        return SupportThreadListResponse(
            items=items,
            total=len(items),
            open_count=open_count,
            resolved_count=resolved_count,
        )

    @staticmethod
    async def get_thread(
        db: AsyncSession,
        user: User,
        thread_id: uuid.UUID,
    ) -> SupportThreadResponse:
        thread = await db.get(SupportThread, thread_id)
        if not thread:
            raise HTTPException(status_code=404, detail="Support thread not found")

        if user.role != "admin" and thread.user_id != user.id:
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to view this support thread.",
            )

        msg_query = (
            select(SupportMessage)
            .where(SupportMessage.thread_id == thread.id)
            .order_by(SupportMessage.created_at.asc())
        )
        res_msgs = await db.execute(msg_query)
        msgs = res_msgs.scalars().all()

        message_items = [
            SupportMessageResponse(
                id=m.id,
                thread_id=m.thread_id,
                sender_id=m.sender_id,
                sender_role=m.sender_role,
                sender_name=m.sender_name,
                content=m.content,
                created_at=m.created_at,
            )
            for m in msgs
        ]

        return SupportThreadResponse(
            id=thread.id,
            user_id=thread.user_id,
            user_role=thread.user_role,
            user_name=thread.user_name,
            user_email=thread.user_email,
            subject=thread.subject,
            category=thread.category,
            status=thread.status,
            created_at=thread.created_at,
            updated_at=thread.updated_at,
            messages=message_items,
            message_count=len(message_items),
        )

    @staticmethod
    async def add_message(
        db: AsyncSession,
        user: User,
        thread_id: uuid.UUID,
        content: str,
    ) -> SupportMessageResponse:
        thread = await db.get(SupportThread, thread_id)
        if not thread:
            raise HTTPException(status_code=404, detail="Support thread not found")

        if user.role != "admin" and thread.user_id != user.id:
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to message in this support thread.",
            )

        # If user replies to resolved ticket, reopen it automatically
        if thread.status == "resolved" and user.role != "admin":
            thread.status = "open"

        now = datetime.now(timezone.utc)
        msg = SupportMessage(
            id=uuid.uuid4(),
            thread_id=thread.id,
            sender_id=user.id,
            sender_role=user.role,
            sender_name=user.full_name,
            content=content.strip(),
            created_at=now,
        )
        db.add(msg)
        thread.updated_at = now

        # If admin replied, send an in-app notification to the thread owner
        if user.role == "admin" and thread.user_id != user.id:
            try:
                notif = Notification(
                    id=uuid.uuid4(),
                    user_id=thread.user_id,
                    sender_id=user.id,
                    job_id=thread.id,  # reused field for thread reference
                    title=f"Support Reply: {thread.subject[:50]}",
                    content=f"An administrator replied to your support query: {content[:100]}...",
                    notification_type="support_reply",
                    details={
                        "thread_id": str(thread.id),
                        "subject": thread.subject,
                        "category": thread.category,
                    },
                )
                db.add(notif)
            except Exception:
                pass

        await db.commit()
        await db.refresh(msg)

        try:
            await event_dispatcher.emit(
                "support.message_created",
                {
                    "message_id": str(msg.id),
                    "thread_id": str(thread.id),
                    "user_id": str(thread.user_id),
                    "sender_id": str(msg.sender_id),
                    "sender_role": msg.sender_role,
                    "sender_name": msg.sender_name,
                    "content": msg.content,
                },
            )
        except Exception:
            pass

        return SupportMessageResponse(
            id=msg.id,
            thread_id=msg.thread_id,
            sender_id=msg.sender_id,
            sender_role=msg.sender_role,
            sender_name=msg.sender_name,
            content=msg.content,
            created_at=msg.created_at,
        )

    @staticmethod
    async def update_status(
        db: AsyncSession,
        user: User,
        thread_id: uuid.UUID,
        status: str,
    ) -> SupportThreadResponse:
        if user.role != "admin":
            raise HTTPException(
                status_code=403,
                detail="Only administrators can update support thread status.",
            )

        thread = await db.get(SupportThread, thread_id)
        if not thread:
            raise HTTPException(status_code=404, detail="Support thread not found")

        thread.status = status
        thread.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(thread)

        try:
            event_name = "support.thread_resolved" if status == "resolved" else "support.thread_updated"
            await event_dispatcher.emit(
                event_name,
                {
                    "thread_id": str(thread.id),
                    "user_id": str(thread.user_id),
                    "status": status,
                },
            )
        except Exception:
            pass

        return await SupportService.get_thread(db, user, thread.id)
