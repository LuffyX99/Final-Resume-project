import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
import pytest
from fastapi import HTTPException

from app.models import Notification, SupportMessage, SupportThread, User
from app.services.support_service import SupportService


class SupportTestSession:
    def __init__(self):
        self.storage = {
            User: {},
            SupportThread: {},
            SupportMessage: {},
            Notification: {},
        }
        self.committed = False

    def add(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = uuid.uuid4()
        for model_cls in self.storage:
            if isinstance(obj, model_cls):
                self.storage[model_cls][obj.id] = obj

    async def flush(self):
        pass

    async def commit(self):
        self.committed = True

    async def refresh(self, obj):
        pass

    async def get(self, entity, ident):
        return self.storage.get(entity, {}).get(ident)

    async def execute(self, stmt):
        result = MagicMock()
        str_stmt = str(stmt).lower()

        if "count" in str_stmt:
            if "support_threads" in str_stmt:
                if "resolved" in str_stmt:
                    items = [t for t in self.storage[SupportThread].values() if t.status == "resolved"]
                elif "open" in str_stmt:
                    items = [t for t in self.storage[SupportThread].values() if t.status == "open"]
                else:
                    items = list(self.storage[SupportThread].values())
                result.scalar.return_value = len(items)
            elif "support_messages" in str_stmt:
                items = list(self.storage[SupportMessage].values())
                result.scalar.return_value = len(items)
            return result

        if "support_threads" in str_stmt:
            threads = list(self.storage[SupportThread].values())
            try:
                params = stmt.compile().params
                for k, v in params.items():
                    if "user_id" in k:
                        threads = [t for t in threads if t.user_id == v]
                    elif "status" in k:
                        threads = [t for t in threads if t.status == v]
            except Exception:
                pass
            result.scalars.return_value.all.return_value = threads
            return result

        if "support_messages" in str_stmt:
            msgs = list(self.storage[SupportMessage].values())
            try:
                params = stmt.compile().params
                for k, v in params.items():
                    if "thread_id" in k:
                        msgs = [m for m in msgs if m.thread_id == v]
            except Exception:
                pass
            result.scalars.return_value.all.return_value = msgs
            return result

        result.scalars.return_value.all.return_value = []
        result.scalar_one_or_none.return_value = None
        result.scalar.return_value = 0
        return result


def make_user(role="candidate", email=None, full_name="User"):
    return User(
        id=uuid.uuid4(),
        role=role,
        full_name=full_name,
        email=email or f"{role}_{uuid.uuid4().hex[:6]}@example.com",
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )


class TestSupportService:
    @pytest.mark.asyncio
    async def test_candidate_creates_support_thread_with_initial_message(self):
        db = SupportTestSession()
        candidate = make_user("candidate", full_name="Alice Candidate")
        db.add(candidate)

        thread = await SupportService.create_thread(
            db=db,
            user=candidate,
            subject="Cannot upload DOCX resume",
            category="technical",
            message="Every time I upload my docx file it says invalid format.",
        )

        assert thread.subject == "Cannot upload DOCX resume"
        assert thread.category == "technical"
        assert thread.status == "open"
        assert thread.user_id == candidate.id
        assert thread.user_name == "Alice Candidate"
        assert len(thread.messages) == 1
        assert thread.messages[0].content == "Every time I upload my docx file it says invalid format."
        assert thread.messages[0].sender_id == candidate.id
        assert db.committed is True

    @pytest.mark.asyncio
    async def test_list_threads_filters_by_ownership_for_non_admin(self):
        db = SupportTestSession()
        c1 = make_user("candidate", full_name="Cand 1")
        c2 = make_user("candidate", full_name="Cand 2")
        admin = make_user("admin", full_name="System Admin")
        db.add(c1)
        db.add(c2)
        db.add(admin)

        now = datetime.now(timezone.utc)
        # Thread for c1
        t1 = SupportThread(
            id=uuid.uuid4(),
            user_id=c1.id,
            user_role="candidate",
            user_name="Cand 1",
            user_email=c1.email,
            subject="Question 1",
            category="general",
            status="open",
            created_at=now,
            updated_at=now,
        )
        # Thread for c2
        t2 = SupportThread(
            id=uuid.uuid4(),
            user_id=c2.id,
            user_role="candidate",
            user_name="Cand 2",
            user_email=c2.email,
            subject="Question 2",
            category="general",
            status="open",
            created_at=now,
            updated_at=now,
        )
        db.add(t1)
        db.add(t2)

        # Candidate lists only their threads
        res_cand = await SupportService.list_threads(db, c1)
        assert len(res_cand.items) == 1
        assert res_cand.items[0].id == t1.id

        # Admin lists all threads
        res_admin = await SupportService.list_threads(db, admin)
        assert len(res_admin.items) == 2

    @pytest.mark.asyncio
    async def test_candidate_cannot_view_another_users_thread(self):
        db = SupportTestSession()
        c1 = make_user("candidate")
        c2 = make_user("candidate")
        db.add(c1)
        db.add(c2)

        t1 = SupportThread(
            id=uuid.uuid4(),
            user_id=c1.id,
            user_role="candidate",
            user_name=c1.full_name,
            user_email=c1.email,
            subject="Private Issue",
            category="account",
            status="open",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(t1)

        # c2 attempts to view c1's thread -> 403 Forbidden
        with pytest.raises(HTTPException) as exc:
            await SupportService.get_thread(db, user=c2, thread_id=t1.id)
        assert exc.value.status_code == 403
        assert "do not have permission" in exc.value.detail

        # c1 can view their own thread
        viewed = await SupportService.get_thread(db, user=c1, thread_id=t1.id)
        assert viewed.id == t1.id

    @pytest.mark.asyncio
    async def test_admin_can_view_any_thread_and_reply_with_notification(self):
        db = SupportTestSession()
        c1 = make_user("candidate")
        admin = make_user("admin")
        db.add(c1)
        db.add(admin)

        t1 = SupportThread(
            id=uuid.uuid4(),
            user_id=c1.id,
            user_role="candidate",
            user_name=c1.full_name,
            user_email=c1.email,
            subject="Need verification",
            category="account",
            status="open",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(t1)

        # Admin views candidate's thread
        viewed = await SupportService.get_thread(db, user=admin, thread_id=t1.id)
        assert viewed.id == t1.id

        # Admin sends reply
        reply = await SupportService.add_message(
            db=db,
            user=admin,
            thread_id=t1.id,
            content="Your account has been verified. Please try logging in again.",
        )
        assert reply.content == "Your account has been verified. Please try logging in again."
        assert reply.sender_role == "admin"

        # Check in-app notification was dispatched to candidate
        notifs = list(db.storage[Notification].values())
        assert len(notifs) >= 1
        notif = notifs[0]
        assert notif.user_id == c1.id
        assert notif.notification_type == "support_reply"

    @pytest.mark.asyncio
    async def test_admin_resolves_thread_and_candidate_cannot_change_status(self):
        db = SupportTestSession()
        c1 = make_user("candidate")
        admin = make_user("admin")
        db.add(c1)
        db.add(admin)

        t1 = SupportThread(
            id=uuid.uuid4(),
            user_id=c1.id,
            user_role="candidate",
            user_name=c1.full_name,
            user_email=c1.email,
            subject="Billing question",
            category="general",
            status="open",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(t1)

        # Candidate cannot change status -> 403 Forbidden
        with pytest.raises(HTTPException) as exc:
            await SupportService.update_status(db, user=c1, thread_id=t1.id, status="resolved")
        assert exc.value.status_code == 403

        # Admin can resolve thread
        updated = await SupportService.update_status(db, user=admin, thread_id=t1.id, status="resolved")
        assert updated.status == "resolved"
        assert t1.status == "resolved"
