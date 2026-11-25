import asyncio
import io
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import AsyncMock, MagicMock
import jwt
import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.database import get_db
from app.main import app
from app.models import Application, Job, Match, Notification, SupportMessage, SupportThread, User
from app.security import create_access_token, hash_password
from app.services.events import event_dispatcher
from app.services.integrity.hidden_text import HiddenTextDetector
from app.services.integrity.keyword_stuffing import KeywordStuffingDetector
from app.services.resume_upload import ResumeUploadError, read_resume_upload
from fastapi import UploadFile


class SecurityMockSession:
    def __init__(self):
        self.storage: dict[type, dict[uuid.UUID, Any]] = {
            User: {},
            Job: {},
            Application: {},
            Match: {},
            Notification: {},
            SupportThread: {},
            SupportMessage: {},
        }
        self.committed = False

    def add(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = uuid.uuid4()
        for model_cls in self.storage:
            if isinstance(obj, model_cls):
                self.storage[model_cls][obj.id] = obj

    def add_all(self, objs):
        for obj in objs:
            self.add(obj)

    async def flush(self):
        pass

    async def commit(self):
        self.committed = True

    async def rollback(self):
        pass

    async def refresh(self, obj):
        pass

    async def get(self, entity, ident):
        return self.storage.get(entity, {}).get(ident)

    async def execute(self, stmt):
        mock_result = MagicMock()
        str_stmt = str(stmt).lower()
        if "count" in str_stmt:
            mock_result.scalar.return_value = 0
            mock_result.one_or_none.return_value = (0, 0)
        mock_result.scalar.return_value = 0
        mock_result.scalars.return_value.all.return_value = []
        mock_result.one_or_none.return_value = None
        mock_result.all.return_value = []
        return mock_result


@pytest.fixture(autouse=True)
def clean_events_and_overrides():
    event_dispatcher.clear()
    yield
    event_dispatcher.clear()
    app.dependency_overrides.clear()


@pytest.fixture
def security_fixture():
    session = SecurityMockSession()

    cand1 = User(
        id=uuid.uuid4(),
        email="cand1@test.com",
        role="candidate",
        full_name="Candidate One",
        password_hash=hash_password("Pass123456!"),
        is_active=True,
    )
    cand2 = User(
        id=uuid.uuid4(),
        email="cand2@test.com",
        role="candidate",
        full_name="Candidate Two",
        password_hash=hash_password("Pass123456!"),
        is_active=True,
    )
    rec1 = User(
        id=uuid.uuid4(),
        email="rec1@test.com",
        role="recruiter",
        full_name="Recruiter One",
        password_hash=hash_password("Pass123456!"),
        is_active=True,
    )
    rec2 = User(
        id=uuid.uuid4(),
        email="rec2@test.com",
        role="recruiter",
        full_name="Recruiter Two",
        password_hash=hash_password("Pass123456!"),
        is_active=True,
    )
    admin = User(
        id=uuid.uuid4(),
        email="admin@test.com",
        role="admin",
        full_name="Platform Admin",
        password_hash=hash_password("AdminPass123!"),
        is_active=True,
    )
    deactivated_user = User(
        id=uuid.uuid4(),
        email="deactive@test.com",
        role="candidate",
        full_name="Deactivated Candidate",
        password_hash=hash_password("Pass123456!"),
        is_active=False,
    )

    job1 = Job(
        id=uuid.uuid4(),
        title="Backend Engineer",
        company="Company A",
        description="Engineering role",
        recruiter_id=rec1.id,
        status="open",
        created_at=datetime.now(timezone.utc),
    )
    job2 = Job(
        id=uuid.uuid4(),
        title="Frontend Engineer",
        company="Company B",
        description="Frontend role",
        recruiter_id=rec2.id,
        status="open",
        created_at=datetime.now(timezone.utc),
    )

    app1 = Application(
        id=uuid.uuid4(),
        job_id=job1.id,
        candidate_id=cand1.id,
        applicant_name="Candidate One",
        applicant_email="cand1@test.com",
        status="submitted",
        created_at=datetime.now(timezone.utc),
    )

    notif1 = Notification(
        id=uuid.uuid4(),
        user_id=cand1.id,
        sender_id=rec1.id,
        title="Candidate One Notification",
        content="Confidential message for Cand 1",
        notification_type="shortlist_invitation",
        is_read=False,
        created_at=datetime.now(timezone.utc),
    )

    thread1 = SupportThread(
        id=uuid.uuid4(),
        user_id=cand1.id,
        user_role="candidate",
        user_name="Candidate One",
        user_email="cand1@test.com",
        subject="Private Query Cand 1",
        status="open",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    session.add_all([
        cand1, cand2, rec1, rec2, admin, deactivated_user,
        job1, job2, app1, notif1, thread1,
    ])

    cand1_token, _ = create_access_token(cand1.id, cand1.role)
    cand2_token, _ = create_access_token(cand2.id, cand2.role)
    rec1_token, _ = create_access_token(rec1.id, rec1.role)
    rec2_token, _ = create_access_token(rec2.id, rec2.role)
    admin_token, _ = create_access_token(admin.id, admin.role)
    deactive_token, _ = create_access_token(deactivated_user.id, deactivated_user.role)

    async def override_get_db():
        yield session

    app.dependency_overrides[get_db] = override_get_db

    return {
        "session": session,
        "cand1": cand1,
        "cand2": cand2,
        "rec1": rec1,
        "rec2": rec2,
        "admin": admin,
        "deactivated_user": deactivated_user,
        "job1": job1,
        "job2": job2,
        "app1": app1,
        "notif1": notif1,
        "thread1": thread1,
        "cand1_token": cand1_token,
        "cand2_token": cand2_token,
        "rec1_token": rec1_token,
        "rec2_token": rec2_token,
        "admin_token": admin_token,
        "deactive_token": deactive_token,
    }


@pytest.mark.asyncio
class TestBrokenFunctionLevelAuthorization:
    """OWASP API5: Broken Function Level Authorization (BFLA) checks."""

    async def test_candidate_cannot_access_recruiter_endpoints(self, security_fixture):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {security_fixture['cand1_token']}"}

            # 1. Candidate tries to post a job
            resp = await client.post(
                "/api/jobs",
                json={
                    "title": "Hacked Job",
                    "company": "Fake Corp",
                    "description": "Unauthorized posting",
                    "required_skills": ["Python"],
                },
                headers=headers,
            )
            assert resp.status_code == 403

            # 2. Candidate tries to close an existing recruiter job
            resp = await client.post(
                f"/api/jobs/{security_fixture['job1'].id}/close",
                headers=headers,
            )
            assert resp.status_code == 403

            # 3. Candidate tries to send shortlist interview invite
            resp = await client.post(
                "/api/notifications/invite",
                json={
                    "application_id": str(security_fixture["app1"].id),
                    "venue": "Malicious link",
                    "interview_date": "2026-12-01",
                    "interview_time": "10:00 AM",
                    "contact_person": "Hacker",
                },
                headers=headers,
            )
            assert resp.status_code == 403

    async def test_candidate_and_recruiter_cannot_access_admin_endpoints(self, security_fixture):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            for token_key in ("cand1_token", "rec1_token"):
                headers = {"Authorization": f"Bearer {security_fixture[token_key]}"}

                # Admin metrics
                resp = await client.get("/api/admin/metrics", headers=headers)
                assert resp.status_code == 403

                # Admin user directory
                resp = await client.get("/api/admin/users", headers=headers)
                assert resp.status_code == 403

                # Admin job takedown
                resp = await client.post(
                    f"/api/admin/jobs/{security_fixture['job1'].id}/takedown",
                    json={"reason": "Unauthorized takedown attempt"},
                    headers=headers,
                )
                assert resp.status_code == 403

                # Admin update user active status
                resp = await client.patch(
                    f"/api/admin/users/{security_fixture['cand2'].id}/status",
                    json={"is_active": False},
                    headers=headers,
                )
                assert resp.status_code == 403


@pytest.mark.asyncio
class TestBrokenObjectLevelAuthorization:
    """OWASP API1: Broken Object Level Authorization (BOLA / IDOR) checks."""

    async def test_recruiter_cannot_edit_or_close_another_recruiters_job(self, security_fixture):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Recruiter 2 tries to close Job 1 owned by Recruiter 1
            headers = {"Authorization": f"Bearer {security_fixture['rec2_token']}"}
            resp = await client.post(
                f"/api/jobs/{security_fixture['job1'].id}/close",
                headers=headers,
            )
            assert resp.status_code == 403
            assert "permission" in resp.json()["detail"].lower()

    async def test_recruiter_cannot_invite_shortlist_on_unowned_job(self, security_fixture):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Recruiter 2 tries to invite candidate on Job 1 (owned by Recruiter 1)
            headers = {"Authorization": f"Bearer {security_fixture['rec2_token']}"}
            resp = await client.post(
                "/api/notifications/invite",
                json={
                    "application_id": str(security_fixture["app1"].id),
                    "venue": "Google Meet",
                    "interview_date": "2026-12-01",
                    "interview_time": "10:00 AM",
                    "contact_person": "Recruiter 2",
                },
                headers=headers,
            )
            assert resp.status_code in (403, 400)

    async def test_candidate_cannot_view_another_candidates_application(self, security_fixture):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Candidate 2 attempts to view Candidate 1's application readiness/skill gap
            headers = {"Authorization": f"Bearer {security_fixture['cand2_token']}"}
            resp = await client.get(
                f"/api/applications/{security_fixture['app1'].id}/readiness",
                headers=headers,
            )
            assert resp.status_code == 403

            # Candidate 1 attempts to manually override their own shortlist decision
            cand1_headers = {"Authorization": f"Bearer {security_fixture['cand1_token']}"}
            resp_override = await client.post(
                f"/api/applications/{security_fixture['app1'].id}/shortlist-override",
                json={"shortlisted": True, "reason": "Self-promoted override"},
                headers=cand1_headers,
            )
            assert resp_override.status_code == 403

    async def test_candidate_cannot_view_or_message_another_users_support_thread(self, security_fixture):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Candidate 2 attempts to read Candidate 1's support thread
            headers = {"Authorization": f"Bearer {security_fixture['cand2_token']}"}
            resp = await client.get(
                f"/api/support/threads/{security_fixture['thread1'].id}",
                headers=headers,
            )
            assert resp.status_code == 403

            # Candidate 2 attempts to post into Candidate 1's thread
            resp = await client.post(
                f"/api/support/threads/{security_fixture['thread1'].id}/messages",
                json={"content": "Malicious snooping attempt"},
                headers=headers,
            )
            assert resp.status_code == 403


@pytest.mark.asyncio
class TestAuthenticationAndJwtSecurity:
    """OWASP API2: Broken Authentication & JWT handling checks."""

    async def test_rejects_expired_jwt_token(self, security_fixture):
        # Generate token expired 1 hour ago
        payload = {
            "sub": str(security_fixture["cand1"].id),
            "role": "candidate",
            "iat": datetime.now(timezone.utc) - timedelta(hours=2),
            "exp": datetime.now(timezone.utc) - timedelta(hours=1),
            "jti": uuid.uuid4().hex,
        }
        expired_token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/auth/me",
                headers={"Authorization": f"Bearer {expired_token}"},
            )
            assert resp.status_code == 401
            assert "Invalid or expired token" in resp.json()["detail"]

    async def test_rejects_tampered_signature_jwt(self, security_fixture):
        # Generate token with wrong secret
        payload = {
            "sub": str(security_fixture["cand1"].id),
            "role": "admin",  # Attacker attempts privilege escalation
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
            "jti": uuid.uuid4().hex,
        }
        fake_token = jwt.encode(payload, "wrong_attacker_secret_key_12345678", algorithm="HS256")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/admin/metrics",
                headers={"Authorization": f"Bearer {fake_token}"},
            )
            assert resp.status_code == 401

    async def test_rejects_deactivated_user_even_with_valid_token(self, security_fixture):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/auth/me",
                headers={"Authorization": f"Bearer {security_fixture['deactive_token']}"},
            )
            assert resp.status_code == 403
            assert "deactivated" in resp.json()["detail"].lower()


@pytest.mark.asyncio
class TestFileUploadSecurityAndIntegrity:
    """OWASP API8: Security Misconfiguration & Malicious File Upload checks."""

    async def test_rejects_disallowed_file_extension(self):
        fake_exe = UploadFile(
            file=io.BytesIO(b"MZ\x90\x00\x03\x00\x00\x00"),
            filename="malware.exe",
        )
        with pytest.raises(ResumeUploadError, match="supported"):
            await read_resume_upload(fake_exe)

        fake_sh = UploadFile(
            file=io.BytesIO(b"#!/bin/bash\nrm -rf /"),
            filename="script.sh",
        )
        with pytest.raises(ResumeUploadError, match="supported"):
            await read_resume_upload(fake_sh)

    async def test_rejects_oversized_file(self):
        # Exceeds max_resume_bytes (5MB)
        oversized = UploadFile(
            file=io.BytesIO(b"%PDF" + b"A" * (6 * 1024 * 1024)),
            filename="giant_resume.pdf",
        )
        with pytest.raises(ResumeUploadError, match="smaller"):
            await read_resume_upload(oversized)

    async def test_rejects_empty_file(self):
        empty_pdf = UploadFile(
            file=io.BytesIO(b""),
            filename="empty.pdf",
        )
        with pytest.raises(ResumeUploadError, match="empty"):
            await read_resume_upload(empty_pdf)

    async def test_rejects_spoofed_extension_magic_bytes_mismatch(self):
        # .pdf extension with fake text content instead of %PDF magic bytes
        fake_pdf = UploadFile(
            file=io.BytesIO(b"Not a real PDF file header"),
            filename="spoofed.pdf",
        )
        with pytest.raises(ResumeUploadError, match="valid PDF"):
            await read_resume_upload(fake_pdf)

    async def test_hidden_zero_opacity_text_detection_flags_fraud(self):
        detector = KeywordStuffingDetector()
        fraudulent_text = "Experienced Developer.\n\n" + ("software " * 350)
        flags = detector.inspect(fraudulent_text)
        assert len(flags) > 0
        assert any(f.code == "EXCESSIVE_KEYWORD_REPETITION" for f in flags)
        assert any(f.penalty > 0 for f in flags)
