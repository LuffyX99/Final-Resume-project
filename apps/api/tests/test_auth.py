"""Authentication, validation and role-based access tests."""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RecruiterProfile, User
from app.ratelimit import limiter
from app.security import decode_access_token, hash_password

from tests.conftest import TEST_PASSWORD, registration_payload


class TestRegistration:
    @pytest.mark.asyncio
    async def test_candidate_registration_returns_profile_without_secrets(
        self, client: AsyncClient
    ):
        resp = await client.post(
            "/api/auth/register/candidate",
            json=registration_payload("new.candidate@example.com"),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["user"]["role"] == "candidate"
        assert data["user"]["email"] == "new.candidate@example.com"
        assert data["access_token"]
        assert "password" not in data["user"]
        assert "password_hash" not in data["user"]

    @pytest.mark.asyncio
    async def test_registration_starts_a_usable_session(self, client: AsyncClient):
        resp = await client.post(
            "/api/auth/register/candidate",
            json=registration_payload("session@example.com"),
        )
        assert resp.status_code == 201
        token = resp.json()["access_token"]

        me = await client.get(
            "/api/auth/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert me.status_code == 200
        assert me.json()["email"] == "session@example.com"

    @pytest.mark.asyncio
    async def test_duplicate_email_is_case_insensitive(self, client: AsyncClient):
        first = registration_payload("Mixed.Case@Example.com")
        second = registration_payload("mixed.case@example.com")

        assert (
            await client.post("/api/auth/register/candidate", json=first)
        ).status_code == 201

        resp = await client.post("/api/auth/register/candidate", json=second)
        assert resp.status_code == 409
        assert resp.json()["detail"] == (
            "Email is already registered. Try signing in instead."
        )

    @pytest.mark.asyncio
    async def test_recruiter_registration_creates_company_profile(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        resp = await client.post(
            "/api/auth/register/recruiter",
            json=registration_payload(
                "recruiter.profile@example.com", company_name="Globex"
            ),
        )
        assert resp.status_code == 201

        profile = (
            await db_session.execute(
                select(RecruiterProfile).where(
                    RecruiterProfile.company_name == "Globex"
                )
            )
        ).scalar_one()
        assert profile.user_id is not None

    @pytest.mark.asyncio
    async def test_password_mismatch_is_rejected(self, client: AsyncClient):
        resp = await client.post(
            "/api/auth/register/candidate",
            json=registration_payload(
                "mismatch@example.com", confirm_password="Different!1234"
            ),
        )
        assert resp.status_code == 422
        assert resp.json()["detail"] == "Passwords do not match."

    @pytest.mark.asyncio
    async def test_weak_password_is_rejected(self, client: AsyncClient):
        resp = await client.post(
            "/api/auth/register/candidate",
            json=registration_payload(
                "weak@example.com", password="alllowercase", confirm_password="alllowercase"
            ),
        )
        assert resp.status_code == 422
        assert "Password must" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_invalid_phone_and_age_are_rejected(self, client: AsyncClient):
        bad_phone = await client.post(
            "/api/auth/register/candidate",
            json=registration_payload("badphone@example.com", phone_number="not-a-phone"),
        )
        assert bad_phone.status_code == 422

        bad_age = await client.post(
            "/api/auth/register/candidate",
            json=registration_payload("badage@example.com", age=12),
        )
        assert bad_age.status_code == 422

    @pytest.mark.asyncio
    async def test_role_cannot_be_injected_and_admin_route_does_not_exist(
        self, client: AsyncClient
    ):
        injected = registration_payload("sneaky@example.com")
        injected["role"] = "admin"
        resp = await client.post("/api/auth/register/candidate", json=injected)
        assert resp.status_code == 422

        assert (
            await client.post(
                "/api/auth/register/admin",
                json=registration_payload("admin2@example.com"),
            )
        ).status_code == 404


class TestLogin:
    @pytest.mark.asyncio
    async def test_login_returns_jwt_with_role_claim(
        self, client: AsyncClient, candidate_headers
    ):
        resp = await client.post(
            "/api/auth/login",
            json={"email": "candidate@example.com", "password": TEST_PASSWORD},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["token_type"] == "bearer"
        assert body["user"]["role"] == "candidate"

        claims = decode_access_token(body["access_token"])
        assert claims["role"] == "candidate"
        assert claims["sub"] == body["user"]["id"]

    @pytest.mark.asyncio
    async def test_wrong_password_and_unknown_email_share_one_message(
        self, client: AsyncClient, candidate_headers
    ):
        wrong = await client.post(
            "/api/auth/login",
            json={"email": "candidate@example.com", "password": "Wrong!12345"},
        )
        unknown = await client.post(
            "/api/auth/login",
            json={"email": "nobody@example.com", "password": TEST_PASSWORD},
        )

        assert wrong.status_code == 401
        assert unknown.status_code == 401
        assert wrong.json()["detail"] == unknown.json()["detail"]

    @pytest.mark.asyncio
    async def test_admin_with_reserved_domain_can_sign_in(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        db_session.add(
            User(
                role="admin",
                full_name="Local Admin",
                email="root@resumematch.local",
                password_hash=hash_password(TEST_PASSWORD),
            )
        )
        await db_session.commit()

        resp = await client.post(
            "/api/auth/login",
            json={"email": "root@resumematch.local", "password": TEST_PASSWORD},
        )
        assert resp.status_code == 200
        assert resp.json()["user"]["role"] == "admin"

    @pytest.mark.asyncio
    async def test_me_requires_a_token(self, client: AsyncClient):
        assert (await client.get("/api/auth/me")).status_code == 401

    @pytest.mark.asyncio
    async def test_me_rejects_a_forged_token(
        self, client: AsyncClient, candidate_headers
    ):
        resp = await client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer not.a.real.token"},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_rate_limit_blocks_repeated_logins(
        self, client: AsyncClient, candidate_headers
    ):
        limiter.reset()
        limiter.enabled = True

        statuses = []
        for _ in range(6):
            resp = await client.post(
                "/api/auth/login",
                json={
                    "email": "candidate@example.com",
                    "password": "Wrong!12345",
                },
            )
            statuses.append(resp.status_code)

        assert statuses[:5] == [401] * 5
        assert statuses[5] == 429
        assert "Too many login attempts" in resp.json()["detail"]


class TestRoleBasedAccess:
    @pytest.mark.asyncio
    async def test_anonymous_access_is_rejected(self, client: AsyncClient):
        assert (await client.get("/api/jobs")).status_code == 401
        assert (await client.get("/api/resumes")).status_code == 401
        assert (await client.get("/api/matches")).status_code == 401

    @pytest.mark.asyncio
    async def test_candidate_cannot_create_a_job(
        self, client: AsyncClient, candidate_headers
    ):
        resp = await client.post(
            "/api/jobs",
            json={"title": "T", "company": "C", "description": "D"},
            headers=candidate_headers,
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_recruiter_can_create_a_job(
        self,
        client: AsyncClient,
        recruiter_headers,
        mock_embedding_service,
        mock_skill_extraction,
    ):
        resp = await client.post(
            "/api/jobs",
            json={"title": "T", "company": "C", "description": "D"},
            headers=recruiter_headers,
        )
        assert resp.status_code == 201

    @pytest.mark.asyncio
    async def test_candidate_cannot_read_another_candidates_resume(
        self,
        client: AsyncClient,
        candidate_headers,
        mock_embedding_service,
        mock_skill_extraction,
    ):
        created = await client.post(
            "/api/resumes",
            json={"candidate_name": "Owner", "content": "Python engineer"},
            headers=candidate_headers,
        )
        resume_id = created.json()["id"]

        other = await client.post(
            "/api/auth/register/candidate",
            json=registration_payload("other@example.com"),
        )
        assert other.status_code == 201
        login = await client.post(
            "/api/auth/login",
            json={"email": "other@example.com", "password": TEST_PASSWORD},
        )
        other_headers = {
            "Authorization": f"Bearer {login.json()['access_token']}"
        }

        resp = await client.get(
            f"/api/resumes/{resume_id}", headers=other_headers
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_recruiter_cannot_open_another_recruiters_shortlist(
        self,
        client: AsyncClient,
        recruiter_headers,
        admin_headers,
        mock_embedding_service,
        mock_skill_extraction,
    ):
        created = await client.post(
            "/api/jobs",
            json={"title": "Owned", "company": "Acme", "description": "Build"},
            headers=recruiter_headers,
        )
        job_id = created.json()["id"]

        second = await client.post(
            "/api/auth/register/recruiter",
            json=registration_payload(
                "second.recruiter@example.com", company_name="Initech"
            ),
        )
        assert second.status_code == 201
        login = await client.post(
            "/api/auth/login",
            json={
                "email": "second.recruiter@example.com",
                "password": TEST_PASSWORD,
            },
        )
        second_headers = {
            "Authorization": f"Bearer {login.json()['access_token']}"
        }

        assert (
            await client.get(f"/api/jobs/{job_id}/matches", headers=second_headers)
        ).status_code == 403
        assert (
            await client.get(f"/api/jobs/{job_id}/matches", headers=admin_headers)
        ).status_code == 200
