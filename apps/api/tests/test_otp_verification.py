"""Automated test suite for Email OTP Verification."""

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import EmailOTP, User
from app.services.email import email_service
from tests.conftest import TEST_PASSWORD, registration_payload


class TestEmailOTPVerification:
    @pytest.fixture(autouse=True)
    def clean_emails(self):
        email_service.clear()
        yield
        email_service.clear()

    @pytest.mark.asyncio
    async def test_send_otp_success_creates_record_and_dispatches_email(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        email = "test.otp@example.com"
        resp = await client.post(
            "/api/auth/otp/send",
            json={"email": email, "full_name": "Test User"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "Verification code sent" in data["message"]
        assert data["cooldown_seconds"] == 60
        assert data["expires_in"] == 300

        # Check DB record
        stmt = select(EmailOTP).where(EmailOTP.email == email)
        record = (await db_session.execute(stmt)).scalar_one_or_none()
        assert record is not None
        assert record.is_verified is False
        assert record.attempts == 0
        assert record.otp_hash is not None
        # Raw OTP must never be stored in plain text
        assert len(record.otp_hash) == 64  # SHA256 hex string

        # Check delivered email
        assert len(email_service.sent_emails) == 1
        sent = email_service.sent_emails[0]
        assert sent["to"] == email
        assert "verification code" in sent["subject"].lower()
        assert "ResumeMatch" in sent["html"]

    @pytest.mark.asyncio
    async def test_send_otp_existing_email_returns_409(
        self, client: AsyncClient
    ):
        email = "already.registered@example.com"
        # Register a candidate first
        reg_resp = await client.post(
            "/api/auth/register/candidate",
            json=registration_payload(email),
        )
        assert reg_resp.status_code == 201

        # Attempt to request OTP for the existing email
        resp = await client.post(
            "/api/auth/otp/send",
            json={"email": email},
        )
        assert resp.status_code == 409
        assert "already registered" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_send_otp_cooldown_enforced(
        self, client: AsyncClient
    ):
        email = "cooldown.test@example.com"
        # First request succeeds
        resp1 = await client.post(
            "/api/auth/otp/send",
            json={"email": email},
        )
        assert resp1.status_code == 200

        # Second request immediately after triggers cooldown
        resp2 = await client.post(
            "/api/auth/otp/send",
            json={"email": email},
        )
        assert resp2.status_code == 429
        assert "wait" in resp2.json()["detail"].lower()
        assert "seconds" in resp2.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_verify_otp_success_returns_token(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        email = "verify.success@example.com"
        await client.post(
            "/api/auth/otp/send",
            json={"email": email, "full_name": "Success User"},
        )
        # Extract 6-digit code from sent email
        sent_subject = email_service.sent_emails[0]["subject"]
        code = sent_subject.split()[0]
        assert len(code) == 6 and code.isdigit()

        # Verify correct OTP
        resp = await client.post(
            "/api/auth/otp/verify",
            json={"email": email, "otp": code},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "Email verified successfully" in data["message"]
        assert data["verification_token"]

        # Check DB state
        stmt = select(EmailOTP).where(EmailOTP.email == email)
        record = (await db_session.execute(stmt)).scalar_one_or_none()
        assert record.is_verified is True
        assert record.verified_at is not None

    @pytest.mark.asyncio
    async def test_verify_otp_incorrect_code_increments_attempts(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        email = "wrong.otp@example.com"
        await client.post(
            "/api/auth/otp/send",
            json={"email": email},
        )

        resp = await client.post(
            "/api/auth/otp/verify",
            json={"email": email, "otp": "000000"},
        )
        assert resp.status_code == 400
        assert "Invalid verification code" in resp.json()["detail"]
        assert "4 attempt(s) remaining" in resp.json()["detail"]

        stmt = select(EmailOTP).where(EmailOTP.email == email)
        record = (await db_session.execute(stmt)).scalar_one_or_none()
        assert record.attempts == 1

    @pytest.mark.asyncio
    async def test_verify_otp_locks_after_max_attempts(
        self, client: AsyncClient
    ):
        email = "lock.otp@example.com"
        await client.post(
            "/api/auth/otp/send",
            json={"email": email},
        )

        for _ in range(5):
            resp = await client.post(
                "/api/auth/otp/verify",
                json={"email": email, "otp": "000000"},
            )

        assert resp.status_code == 400
        assert "Maximum verification attempts exceeded" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_verify_otp_expired_code(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        email = "expired.otp@example.com"
        await client.post(
            "/api/auth/otp/send",
            json={"email": email},
        )
        code = email_service.sent_emails[0]["subject"].split()[0]

        # Artificially expire the record
        stmt = select(EmailOTP).where(EmailOTP.email == email)
        record = (await db_session.execute(stmt)).scalar_one_or_none()
        record.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        await db_session.commit()

        resp = await client.post(
            "/api/auth/otp/verify",
            json={"email": email, "otp": code},
        )
        assert resp.status_code == 400
        assert "expired" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_registration_with_verified_token_succeeds(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        settings.require_email_otp = True
        try:
            email = "registered.with.token@example.com"
            await client.post(
                "/api/auth/otp/send",
                json={"email": email, "full_name": "Token User"},
            )
            code = email_service.sent_emails[0]["subject"].split()[0]
            verify_res = await client.post(
                "/api/auth/otp/verify",
                json={"email": email, "otp": code},
            )
            token = verify_res.json()["verification_token"]

            payload = registration_payload(email)
            payload["verification_token"] = token

            reg_resp = await client.post(
                "/api/auth/register/candidate",
                json=payload,
            )
            assert reg_resp.status_code == 201
            assert reg_resp.json()["user"]["email"] == email

            # Record must now be marked consumed
            stmt = select(EmailOTP).where(EmailOTP.email == email)
            record = (await db_session.execute(stmt)).scalar_one_or_none()
            assert record.consumed_at is not None
        finally:
            settings.require_email_otp = False

    @pytest.mark.asyncio
    async def test_registration_without_verification_fails_when_enforced(
        self, client: AsyncClient
    ):
        settings.require_email_otp = True
        try:
            email = "unverified.user@example.com"
            payload = registration_payload(email)

            reg_resp = await client.post(
                "/api/auth/register/candidate",
                json=payload,
            )
            assert reg_resp.status_code == 400
            assert "verified" in reg_resp.json()["detail"].lower()
        finally:
            settings.require_email_otp = False

    @pytest.mark.asyncio
    async def test_recruiter_registration_with_verified_token(
        self, client: AsyncClient
    ):
        settings.require_email_otp = True
        try:
            email = "verified.recruiter@example.com"
            await client.post(
                "/api/auth/otp/send",
                json={"email": email, "full_name": "Recruiter One"},
            )
            code = email_service.sent_emails[0]["subject"].split()[0]
            verify_res = await client.post(
                "/api/auth/otp/verify",
                json={"email": email, "otp": code},
            )
            token = verify_res.json()["verification_token"]

            payload = registration_payload(email, company_name="TalentCo")
            payload["verification_token"] = token

            reg_resp = await client.post(
                "/api/auth/register/recruiter",
                json=payload,
            )
            assert reg_resp.status_code == 201
            assert reg_resp.json()["user"]["role"] == "recruiter"
        finally:
            settings.require_email_otp = False
