import asyncio
import json
import uuid
from unittest.mock import MagicMock
import pytest
from httpx import ASGITransport, AsyncClient

from app.database import get_db
from app.main import app
from app.models import User
from app.security import create_access_token, hash_password
from app.services.events import event_dispatcher


class InMemoryDb:
    def __init__(self):
        self.users: dict[uuid.UUID, User] = {}

    def add_user(self, user: User):
        if user.id is None:
            user.id = uuid.uuid4()
        self.users[user.id] = user

    async def get(self, entity, ident):
        if entity is User:
            return self.users.get(ident)
        return None


@pytest.fixture(autouse=True)
def clean_events_and_overrides():
    event_dispatcher.clear()
    yield
    event_dispatcher.clear()
    app.dependency_overrides.clear()


@pytest.mark.asyncio
class TestEventDispatcherAclScoping:
    async def test_admin_receives_all_events(self):
        admin_queue = asyncio.Queue()
        cand_queue = asyncio.Queue()

        unsub_admin = event_dispatcher.subscribe_user("admin-1", "admin", admin_queue)
        unsub_cand = event_dispatcher.subscribe_user("cand-1", "candidate", cand_queue)

        try:
            # Emit private event intended for rec-1 and cand-2
            await event_dispatcher.emit(
                "application.submitted",
                {
                    "application_id": "app-1",
                    "job_id": "job-1",
                    "candidate_id": "cand-2",
                    "recruiter_id": "rec-1",
                },
            )

            assert not admin_queue.empty()
            item = admin_queue.get_nowait()
            assert item["event"] == "application.submitted"

            # cand-1 is not the applicant and not admin
            assert cand_queue.empty()
        finally:
            unsub_admin()
            unsub_cand()

    async def test_public_job_events_broadcast_to_all_authenticated_users(self):
        cand_queue = asyncio.Queue()
        rec_queue = asyncio.Queue()

        unsub_cand = event_dispatcher.subscribe_user("cand-1", "candidate", cand_queue)
        unsub_rec = event_dispatcher.subscribe_user("rec-1", "recruiter", rec_queue)

        try:
            await event_dispatcher.emit(
                "job.created",
                {"job_id": "job-100", "title": "Staff Backend Engineer"},
            )

            assert not cand_queue.empty()
            assert not rec_queue.empty()
            assert cand_queue.get_nowait()["event"] == "job.created"
            assert rec_queue.get_nowait()["event"] == "job.created"
        finally:
            unsub_cand()
            unsub_rec()

    async def test_private_notification_only_delivered_to_target_and_admin(self):
        cand1_queue = asyncio.Queue()
        cand2_queue = asyncio.Queue()

        unsub_cand1 = event_dispatcher.subscribe_user("cand-1", "candidate", cand1_queue)
        unsub_cand2 = event_dispatcher.subscribe_user("cand-2", "candidate", cand2_queue)

        try:
            await event_dispatcher.emit(
                "notification.created",
                {
                    "notification_id": "notif-1",
                    "user_id": "cand-1",
                    "title": "Interview Invite",
                },
            )

            # cand-1 receives it
            assert not cand1_queue.empty()
            assert cand1_queue.get_nowait()["payload"]["title"] == "Interview Invite"

            # cand-2 does NOT receive it
            assert cand2_queue.empty()
        finally:
            unsub_cand1()
            unsub_cand2()

    async def test_support_message_delivered_to_thread_owner_and_admin(self):
        owner_queue = asyncio.Queue()
        other_queue = asyncio.Queue()
        admin_queue = asyncio.Queue()

        unsub_owner = event_dispatcher.subscribe_user("owner-1", "candidate", owner_queue)
        unsub_other = event_dispatcher.subscribe_user("other-2", "recruiter", other_queue)
        unsub_admin = event_dispatcher.subscribe_user("admin-1", "admin", admin_queue)

        try:
            await event_dispatcher.emit(
                "support.message_created",
                {
                    "thread_id": "thread-1",
                    "user_id": "owner-1",
                    "sender_name": "Admin Support",
                    "content": "We have resolved your issue.",
                },
            )

            assert not owner_queue.empty()
            assert owner_queue.get_nowait()["event"] == "support.message_created"

            assert not admin_queue.empty()
            assert admin_queue.get_nowait()["event"] == "support.message_created"

            assert other_queue.empty()
        finally:
            unsub_owner()
            unsub_other()
            unsub_admin()


@pytest.mark.asyncio
class TestEventsStreamEndpoint:
    async def test_stream_requires_authentication(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/events/stream")
            assert resp.status_code == 401
            assert "Authentication token required" in resp.json()["detail"]

    async def test_stream_rejects_invalid_token(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/events/stream?token=invalid.jwt.token")
            assert resp.status_code == 401

    async def test_stream_rejects_deactivated_user(self):
        mem_db = InMemoryDb()
        user_id = uuid.uuid4()
        user = User(
            id=user_id,
            email="deactive@example.com",
            password_hash=hash_password("Pass123456!"),
            role="candidate",
            full_name="Deactivated Candidate",
            is_active=False,
        )
        mem_db.add_user(user)

        async def override_get_db():
            yield mem_db

        app.dependency_overrides[get_db] = override_get_db

        token, _ = create_access_token(user.id, user.role)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(f"/api/events/stream?token={token}")
            assert resp.status_code == 403
            assert "deactivated" in resp.json()["detail"]

    async def test_events_stream_generator_formats_sse_and_unsubscribes(self):
        user_id = uuid.uuid4()
        user = User(
            id=user_id,
            email="streamer@example.com",
            role="candidate",
            full_name="Active Candidate",
            is_active=True,
        )
        mock_request = MagicMock()

        from app.routers.events import events_stream

        resp = await events_stream(request=mock_request, current_user=user)
        gen = resp.body_iterator

        # 1. Read initial connection event
        first_chunk = await gen.__anext__()
        assert "event: connected" in first_chunk
        assert str(user.id) in first_chunk
        assert "candidate" in first_chunk

        # 2. Emit an event and read it from stream
        await event_dispatcher.emit("job.created", {"job_id": "job-999", "title": "Staff Engineer"})
        second_chunk = await gen.__anext__()
        assert "event: job.created" in second_chunk
        assert "job-999" in second_chunk

        # 3. Close generator and verify subscriber was cleanly removed
        await gen.aclose()
        assert len(event_dispatcher._user_subscribers) == 0
