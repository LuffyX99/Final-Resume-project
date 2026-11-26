import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings


@pytest.mark.asyncio
async def test_admin_login_success(client: AsyncClient):
    response = await client.post(
        "/api/admin/login",
        json={"id": settings.admin_id, "password": settings.admin_password},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["admin"]["role"] == "admin"
    assert data["admin"]["id"] == settings.admin_id


@pytest.mark.asyncio
async def test_admin_login_invalid_password(client: AsyncClient):
    response = await client.post(
        "/api/admin/login",
        json={"id": settings.admin_id, "password": "WrongPassword123!"},
    )
    assert response.status_code == 401
    assert "Invalid admin ID or password" in response.json()["detail"]


@pytest.mark.asyncio
async def test_admin_routes_protected(client: AsyncClient, candidate_headers: dict[str, str], db_session: AsyncSession):
    # 1. Unauthenticated request blocked
    res_no_auth = await client.get("/api/admin/metrics")
    assert res_no_auth.status_code == 401

    # 2. Non-admin (candidate) token blocked
    res_cand = await client.get("/api/admin/metrics", headers=candidate_headers)
    assert res_cand.status_code == 403

    # 3. Log in as admin and verify access
    login_res = await client.post(
        "/api/admin/login",
        json={"id": settings.admin_id, "password": settings.admin_password},
    )
    admin_token = login_res.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    res_admin = await client.get("/api/admin/metrics", headers=admin_headers)
    assert res_admin.status_code == 200
    assert "total_candidates" in res_admin.json()

    # 4. Verify admin token cannot access candidate/recruiter user endpoints
    res_user_me = await client.get("/api/auth/me", headers=admin_headers)
    assert res_user_me.status_code == 401

    # 5. Verify admin jobs list endpoint
    res_jobs = await client.get("/api/admin/jobs", headers=admin_headers)
    assert res_jobs.status_code == 200, res_jobs.text

    # 6. Verify admin shortlisted list endpoint
    res_short = await client.get("/api/admin/shortlisted", headers=admin_headers)
    assert res_short.status_code == 200, res_short.text

    # 7. Create a job and an application and verify endpoints with actual rows
    from app.models import Job, User, Application, Resume
    import uuid

    session = db_session
    rec = User(
        email="rec_test@example.com",
        full_name="Recruiter One",
        password_hash="fakehash",
        role="recruiter",
    )
    cand = User(
        email="cand_test@example.com",
        full_name="Candidate One",
        password_hash="fakehash",
        role="candidate",
    )
    session.add_all([rec, cand])
    await session.commit()
    await session.refresh(rec)
    await session.refresh(cand)

    job1 = Job(
        title="Software Engineer",
        company="Test Inc",
        description="Coding",
        recruiter_id=rec.id,
        status="open",
    )
    job2 = Job(
        title="Standalone Job",
        company="Orphan Inc",
        description="No recruiter",
        recruiter_id=None,
        status="open",
    )
    session.add_all([job1, job2])
    await session.commit()
    await session.refresh(job1)
    await session.refresh(job2)

    resume = Resume(
        content="Sample resume text",
        candidate_name="Candidate One",
    )
    session.add(resume)
    await session.commit()
    await session.refresh(resume)

    app1 = Application(
        candidate_id=cand.id,
        job_id=job1.id,
        resume_id=resume.id,
        applicant_name="Candidate One",
        applicant_email="cand_test@example.com",
        status="shortlisted",
        similarity_score=0.85,
        trust_score=0.9,
        final_score=88.0,
    )
    session.add(app1)
    await session.commit()

    res_jobs2 = await client.get("/api/admin/jobs", headers=admin_headers)
    assert res_jobs2.status_code == 200, res_jobs2.text
    jobs_data = res_jobs2.json()
    assert jobs_data["total"] >= 2

    res_short2 = await client.get("/api/admin/shortlisted", headers=admin_headers)
    assert res_short2.status_code == 200, res_short2.text
    short_data = res_short2.json()
    assert short_data["total"] >= 1
