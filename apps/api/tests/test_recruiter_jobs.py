"""Integration and unit tests for recruiter-owned job management."""

import uuid

import pytest
from httpx import AsyncClient

from app.services.job_service import merge_skills
from tests.conftest import TEST_PASSWORD, registration_payload


class TestSkillMergeHelper:
    def test_merge_skills_deduplication_and_order(self):
        recruiter_skills = ["FastAPI", "PostgreSQL", " fastAPI "]
        extracted_skills = ["Python", "fastapi", "SQL", "Docker"]
        merged = merge_skills(recruiter_skills, extracted_skills)
        assert merged == ["FastAPI", "PostgreSQL", "Python", "SQL", "Docker"]

    def test_merge_skills_empty_inputs(self):
        assert merge_skills(None, None) == []
        assert merge_skills([], []) == []
        assert merge_skills(["Python"], None) == ["Python"]
        assert merge_skills(None, ["Python"]) == ["Python"]


class TestRecruiterJobCreation:
    @pytest.mark.asyncio
    async def test_create_job_with_all_fields_and_skills(
        self,
        client: AsyncClient,
        recruiter_headers,
        mock_embedding_service,
        mock_skill_extraction,
    ):
        payload = {
            "title": "Lead Backend Engineer",
            "company": "Acme Innovations",
            "description": "Design distributed microservices in Python and cloud",
            "required_skills": ["FastAPI", "Kubernetes", "PostgreSQL"],
            "location": "Remote / New York",
            "experience": "Senior (5+ years)",
            "job_type": "full-time",
        }
        resp = await client.post("/api/jobs", json=payload, headers=recruiter_headers)
        assert resp.status_code == 201
        data = resp.json()

        assert data["title"] == "Lead Backend Engineer"
        assert data["company"] == "Acme Innovations"
        assert data["description"] == "Design distributed microservices in Python and cloud"
        assert data["location"] == "Remote / New York"
        assert data["experience"] == "Senior (5+ years)"
        assert data["job_type"] == "full-time"
        assert data["status"] == "open"
        assert data["recruiter_id"] is not None

        # Check visibility of recruiter-typed, AI-extracted, and merged skills
        assert data["required_skills"] == ["FastAPI", "Kubernetes", "PostgreSQL"]
        assert data["extracted_skills"] == ["Python", "FastAPI", "SQL"]
        # Merged deduplicates 'FastAPI'
        assert data["skills"] == ["FastAPI", "Kubernetes", "PostgreSQL", "Python", "SQL"]

    @pytest.mark.asyncio
    async def test_candidate_cannot_create_job(
        self,
        client: AsyncClient,
        candidate_headers,
    ):
        payload = {
            "title": "Engineer",
            "company": "Company",
            "description": "Description",
        }
        resp = await client.post("/api/jobs", json=payload, headers=candidate_headers)
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_job_validation_rejects_empty_fields(
        self,
        client: AsyncClient,
        recruiter_headers,
    ):
        resp = await client.post(
            "/api/jobs",
            json={"title": "   ", "company": "Co", "description": "Desc"},
            headers=recruiter_headers,
        )
        assert resp.status_code == 422


class TestRecruiterJobOwnershipAndManagement:
    @pytest.fixture
    async def second_recruiter_headers(self, client: AsyncClient) -> dict[str, str]:
        resp = await client.post(
            "/api/auth/register/recruiter",
            json=registration_payload(
                "recruiter2@example.com", company_name="Beta Corp"
            ),
        )
        assert resp.status_code == 201
        login_resp = await client.post(
            "/api/auth/login",
            json={"email": "recruiter2@example.com", "password": TEST_PASSWORD},
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    @pytest.mark.asyncio
    async def test_recruiter_can_only_list_own_jobs(
        self,
        client: AsyncClient,
        recruiter_headers,
        second_recruiter_headers,
        mock_embedding_service,
        mock_skill_extraction,
    ):
        # Recruiter 1 creates 2 jobs
        await client.post(
            "/api/jobs",
            json={"title": "R1 Job 1", "company": "Acme", "description": "D1"},
            headers=recruiter_headers,
        )
        await client.post(
            "/api/jobs",
            json={"title": "R1 Job 2", "company": "Acme", "description": "D2"},
            headers=recruiter_headers,
        )

        # Recruiter 2 creates 1 job
        await client.post(
            "/api/jobs",
            json={"title": "R2 Job 1", "company": "Beta", "description": "D3"},
            headers=second_recruiter_headers,
        )

        # Recruiter 1 fetches /mine: sees ONLY their 2 jobs
        r1_mine = await client.get("/api/jobs/mine", headers=recruiter_headers)
        assert r1_mine.status_code == 200
        r1_jobs = r1_mine.json()
        assert len(r1_jobs) == 2
        assert {j["title"] for j in r1_jobs} == {"R1 Job 1", "R1 Job 2"}

        # Recruiter 2 fetches /mine: sees ONLY their 1 job
        r2_mine = await client.get("/api/jobs/mine", headers=second_recruiter_headers)
        assert r2_mine.status_code == 200
        r2_jobs = r2_mine.json()
        assert len(r2_jobs) == 1
        assert r2_jobs[0]["title"] == "R2 Job 1"

        # Recruiter 1 fetches /api/jobs: server-side filters to only their jobs
        r1_all = await client.get("/api/jobs", headers=recruiter_headers)
        assert r1_all.status_code == 200
        assert len(r1_all.json()) == 2

    @pytest.mark.asyncio
    async def test_recruiter_can_edit_own_job_and_triggers_reembedding(
        self,
        client: AsyncClient,
        recruiter_headers,
        mock_embedding_service,
        mock_skill_extraction,
    ):
        created = await client.post(
            "/api/jobs",
            json={
                "title": "Software Engineer",
                "company": "Acme",
                "description": "Original description",
                "required_skills": ["Python"],
                "location": "Boston",
            },
            headers=recruiter_headers,
        )
        job_id = created.json()["id"]

        # Edit job
        patch_payload = {
            "title": "Senior Software Engineer",
            "description": "Updated description with FastAPI and PostgreSQL",
            "required_skills": ["Python", "FastAPI", "Docker"],
            "location": "Remote",
            "job_type": "contract",
        }
        patch_resp = await client.patch(
            f"/api/jobs/{job_id}",
            json=patch_payload,
            headers=recruiter_headers,
        )
        assert patch_resp.status_code == 200
        data = patch_resp.json()
        assert data["title"] == "Senior Software Engineer"
        assert data["description"] == "Updated description with FastAPI and PostgreSQL"
        assert data["location"] == "Remote"
        assert data["job_type"] == "contract"
        assert data["required_skills"] == ["Python", "FastAPI", "Docker"]
        assert "Docker" in data["skills"]

        # Immediately fetch to ensure change is committed
        fetch_resp = await client.get(f"/api/jobs/{job_id}", headers=recruiter_headers)
        assert fetch_resp.status_code == 200
        assert fetch_resp.json()["title"] == "Senior Software Engineer"

    @pytest.mark.asyncio
    async def test_recruiter_cannot_edit_other_recruiters_job(
        self,
        client: AsyncClient,
        recruiter_headers,
        second_recruiter_headers,
        mock_embedding_service,
        mock_skill_extraction,
    ):
        # Recruiter 1 creates job
        created = await client.post(
            "/api/jobs",
            json={"title": "R1 Dev", "company": "Acme", "description": "Desc"},
            headers=recruiter_headers,
        )
        job_id = created.json()["id"]

        # Recruiter 2 tries to edit Recruiter 1's job -> 403 Forbidden
        patch_resp = await client.patch(
            f"/api/jobs/{job_id}",
            json={"title": "Hacked Title"},
            headers=second_recruiter_headers,
        )
        assert patch_resp.status_code == 403

    @pytest.mark.asyncio
    async def test_candidate_cannot_edit_job(
        self,
        client: AsyncClient,
        recruiter_headers,
        candidate_headers,
        mock_embedding_service,
        mock_skill_extraction,
    ):
        created = await client.post(
            "/api/jobs",
            json={"title": "Dev", "company": "Acme", "description": "Desc"},
            headers=recruiter_headers,
        )
        job_id = created.json()["id"]

        patch_resp = await client.patch(
            f"/api/jobs/{job_id}",
            json={"title": "Candidate Edit"},
            headers=candidate_headers,
        )
        assert patch_resp.status_code == 403

    @pytest.mark.asyncio
    async def test_close_job_workflow(
        self,
        client: AsyncClient,
        recruiter_headers,
        second_recruiter_headers,
        candidate_headers,
        mock_embedding_service,
        mock_skill_extraction,
    ):
        created = await client.post(
            "/api/jobs",
            json={"title": "To Close", "company": "Acme", "description": "Desc"},
            headers=recruiter_headers,
        )
        job_id = created.json()["id"]
        assert created.json()["status"] == "open"

        # Candidate and other recruiter cannot close
        assert (
            await client.post(
                f"/api/jobs/{job_id}/close", headers=candidate_headers
            )
        ).status_code == 403
        assert (
            await client.post(
                f"/api/jobs/{job_id}/close", headers=second_recruiter_headers
            )
        ).status_code == 403

        # Owner closes job
        close_resp = await client.post(
            f"/api/jobs/{job_id}/close", headers=recruiter_headers
        )
        assert close_resp.status_code == 200
        assert close_resp.json()["status"] == "closed"

        # Committed immediately to DB: next fetch reflects status
        get_resp = await client.get(f"/api/jobs/{job_id}", headers=recruiter_headers)
        assert get_resp.status_code == 200
        assert get_resp.json()["status"] == "closed"

        # Filter by status on /mine
        open_list = await client.get(
            "/api/jobs/mine?status=open", headers=recruiter_headers
        )
        assert len(open_list.json()) == 0

        closed_list = await client.get(
            "/api/jobs/mine?status=closed", headers=recruiter_headers
        )
        assert len(closed_list.json()) == 1

    @pytest.mark.asyncio
    async def test_delete_job_workflow(
        self,
        client: AsyncClient,
        recruiter_headers,
        second_recruiter_headers,
        candidate_headers,
        mock_embedding_service,
        mock_skill_extraction,
    ):
        created = await client.post(
            "/api/jobs",
            json={"title": "To Delete", "company": "Acme", "description": "Desc"},
            headers=recruiter_headers,
        )
        job_id = created.json()["id"]

        # Candidate and other recruiter cannot delete
        assert (
            await client.delete(
                f"/api/jobs/{job_id}", headers=candidate_headers
            )
        ).status_code == 403
        assert (
            await client.delete(
                f"/api/jobs/{job_id}", headers=second_recruiter_headers
            )
        ).status_code == 403

        # Owner deletes job
        del_resp = await client.delete(
            f"/api/jobs/{job_id}", headers=recruiter_headers
        )
        assert del_resp.status_code == 204

        # Committed immediately to DB: next fetch is 404
        get_resp = await client.get(f"/api/jobs/{job_id}", headers=recruiter_headers)
        assert get_resp.status_code == 404


class TestPublicCandidateFacingEndpoint:
    @pytest.fixture
    async def second_recruiter_headers(self, client: AsyncClient) -> dict[str, str]:
        resp = await client.post(
            "/api/auth/register/recruiter",
            json=registration_payload(
                "recruiter_b@example.com", company_name="Gamma Labs"
            ),
        )
        assert resp.status_code == 201
        login_resp = await client.post(
            "/api/auth/login",
            json={"email": "recruiter_b@example.com", "password": TEST_PASSWORD},
        )
        assert login_resp.status_code == 200
        return {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

    @pytest.mark.asyncio
    async def test_public_endpoint_accessible_without_auth(
        self,
        client: AsyncClient,
    ):
        # No Authorization header at all
        resp = await client.get("/api/jobs/public")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.asyncio
    async def test_public_endpoint_lists_open_jobs_from_all_recruiters(
        self,
        client: AsyncClient,
        recruiter_headers,
        second_recruiter_headers,
        mock_embedding_service,
        mock_skill_extraction,
    ):
        # Recruiter A posts an open job and a closed job
        await client.post(
            "/api/jobs",
            json={
                "title": "Backend Python Dev",
                "company": "Alpha Tech",
                "description": "Building FastAPI backends",
                "location": "Remote",
                "job_type": "full-time",
            },
            headers=recruiter_headers,
        )
        r1_job2 = await client.post(
            "/api/jobs",
            json={
                "title": "Closed Job",
                "company": "Alpha Tech",
                "description": "No longer hiring",
            },
            headers=recruiter_headers,
        )
        await client.post(
            f"/api/jobs/{r1_job2.json()['id']}/close",
            headers=recruiter_headers,
        )

        # Recruiter B posts an open job
        await client.post(
            "/api/jobs",
            json={
                "title": "Frontend React Dev",
                "company": "Gamma Labs",
                "description": "Building Next.js apps",
                "location": "San Francisco",
                "job_type": "contract",
            },
            headers=second_recruiter_headers,
        )

        # Public candidate list: should see only open jobs from BOTH recruiters
        pub_resp = await client.get("/api/jobs/public")
        assert pub_resp.status_code == 200
        jobs = pub_resp.json()
        assert len(jobs) == 2
        titles = {j["title"] for j in jobs}
        assert "Backend Python Dev" in titles
        assert "Frontend React Dev" in titles
        assert "Closed Job" not in titles

    @pytest.mark.asyncio
    async def test_public_endpoint_search_and_filtering(
        self,
        client: AsyncClient,
        recruiter_headers,
        mock_embedding_service,
        mock_skill_extraction,
    ):
        await client.post(
            "/api/jobs",
            json={
                "title": "Data Scientist",
                "company": "DataCorp",
                "description": "Statistical modeling and ML",
                "required_skills": ["Python", "Pandas"],
                "location": "Chicago",
                "experience": "Mid-level",
                "job_type": "full-time",
            },
            headers=recruiter_headers,
        )
        await client.post(
            "/api/jobs",
            json={
                "title": "DevOps Engineer",
                "company": "CloudSys",
                "description": "Kubernetes and Terraform",
                "required_skills": ["Docker", "Kubernetes"],
                "location": "Remote",
                "experience": "Senior",
                "job_type": "contract",
            },
            headers=recruiter_headers,
        )

        # Search by keyword
        resp = await client.get("/api/jobs/public?search=statistical")
        assert resp.status_code == 200
        assert len(resp.json()) == 1
        assert resp.json()[0]["title"] == "Data Scientist"

        # Filter by location
        resp = await client.get("/api/jobs/public?location=remote")
        assert resp.status_code == 200
        assert len(resp.json()) == 1
        assert resp.json()[0]["title"] == "DevOps Engineer"

        # Filter by job_type
        resp = await client.get("/api/jobs/public?job_type=contract")
        assert resp.status_code == 200
        assert len(resp.json()) == 1
        assert resp.json()[0]["title"] == "DevOps Engineer"

        # Filter by experience
        resp = await client.get("/api/jobs/public?experience=mid-level")
        assert resp.status_code == 200
        assert len(resp.json()) == 1
        assert resp.json()[0]["title"] == "Data Scientist"

        # Filter by skill
        resp = await client.get("/api/jobs/public?skill=pandas")
        assert resp.status_code == 200
        assert len(resp.json()) == 1
        assert resp.json()[0]["title"] == "Data Scientist"

        # Filter by company
        resp = await client.get("/api/jobs/public?company=datacorp")
        assert resp.status_code == 200
        assert len(resp.json()) == 1
        assert resp.json()[0]["title"] == "Data Scientist"

    @pytest.mark.asyncio
    async def test_public_endpoint_pagination(
        self,
        client: AsyncClient,
        recruiter_headers,
        mock_embedding_service,
        mock_skill_extraction,
    ):
        for i in range(5):
            await client.post(
                "/api/jobs",
                json={
                    "title": f"Job {i}",
                    "company": "Acme",
                    "description": f"Desc {i}",
                },
                headers=recruiter_headers,
            )

        resp_page1 = await client.get("/api/jobs/public?skip=0&limit=2")
        assert resp_page1.status_code == 200
        assert len(resp_page1.json()) == 2

        resp_page2 = await client.get("/api/jobs/public?skip=2&limit=2")
        assert resp_page2.status_code == 200
        assert len(resp_page2.json()) == 2

        # Elements should be different
        ids_p1 = {j["id"] for j in resp_page1.json()}
        ids_p2 = {j["id"] for j in resp_page2.json()}
        assert ids_p1.isdisjoint(ids_p2)

    @pytest.mark.asyncio
    async def test_immediate_visibility_on_create_edit_close_delete(
        self,
        client: AsyncClient,
        recruiter_headers,
        mock_embedding_service,
        mock_skill_extraction,
    ):
        # 1. On create -> immediately visible in public endpoint
        create_resp = await client.post(
            "/api/jobs",
            json={"title": "Immediate Job", "company": "Speed Inc", "description": "Fast"},
            headers=recruiter_headers,
        )
        job_id = create_resp.json()["id"]

        pub1 = await client.get("/api/jobs/public?search=immediate")
        assert len(pub1.json()) == 1
        assert pub1.json()[0]["id"] == job_id

        # 2. On edit -> immediately visible in public endpoint
        await client.patch(
            f"/api/jobs/{job_id}",
            json={"title": "Updated Speed Job"},
            headers=recruiter_headers,
        )
        pub2 = await client.get(f"/api/jobs/public?search=speed")
        assert len(pub2.json()) == 1
        assert pub2.json()[0]["title"] == "Updated Speed Job"

        # 3. On close -> immediately disappears from public endpoint
        await client.post(
            f"/api/jobs/{job_id}/close",
            headers=recruiter_headers,
        )
        pub3 = await client.get(f"/api/jobs/public?search=speed")
        assert len(pub3.json()) == 0

        # 4. On delete -> immediately gone
        await client.delete(
            f"/api/jobs/{job_id}",
            headers=recruiter_headers,
        )
        pub4 = await client.get(f"/api/jobs/public?search=speed")
        assert len(pub4.json()) == 0


    @pytest.mark.asyncio
    async def test_shortlist_toggle_and_live_job_counts(
        self,
        client: AsyncClient,
        recruiter_headers,
        candidate_headers,
        db_session,
        mock_embedding_service,
        mock_skill_extraction,
    ):
        from app.models import Match as MatchModel

        # 1. Recruiter creates job
        job_res = await client.post(
            "/api/jobs",
            json={"title": "Cloud Architect", "company": "SkyNet", "description": "Cloud systems"},
            headers=recruiter_headers,
        )
        job_id = job_res.json()["id"]

        # 2. Candidate creates resume
        resume_res = await client.post(
            "/api/resumes",
            json={"candidate_name": "Alice Candidate", "content": "AWS and cloud architect experience"},
            headers=candidate_headers,
        )
        resume_id = resume_res.json()["id"]

        # 3. Insert a Match row directly (avoids pgvector cosine_distance in SQLite)
        match_obj = MatchModel(
            job_id=uuid.UUID(job_id),
            resume_id=uuid.UUID(resume_id),
            similarity_score=0.85,
            bias_reduced=False,
            shortlisted=False,
        )
        db_session.add(match_obj)
        await db_session.commit()
        await db_session.refresh(match_obj)
        match_id = str(match_obj.id)

        # 4. Check /mine applicant_count and shortlisted_count
        mine_res = await client.get("/api/jobs/mine", headers=recruiter_headers)
        my_job = next(j for j in mine_res.json() if j["id"] == job_id)
        assert my_job["applicant_count"] == 1
        assert my_job["shortlisted_count"] == 0

        # 5. Toggle match shortlist
        patch_res = await client.patch(
            f"/api/matches/{match_id}",
            json={"shortlisted": True},
            headers=recruiter_headers,
        )
        assert patch_res.status_code == 200
        assert patch_res.json()["shortlisted"] is True

        # 6. Check /mine immediately reflects updated shortlisted count
        mine_res2 = await client.get("/api/jobs/mine", headers=recruiter_headers)
        my_job2 = next(j for j in mine_res2.json() if j["id"] == job_id)
        assert my_job2["applicant_count"] == 1
        assert my_job2["shortlisted_count"] == 1


class TestApplicationDetail:
    """Recruiters review an applicant through the job they own."""

    @pytest.fixture
    async def application(
        self,
        client: AsyncClient,
        recruiter_headers,
        candidate_headers,
        db_session,
        mock_embedding_service,
        mock_skill_extraction,
    ) -> dict:
        from app.models import Match as MatchModel

        job_res = await client.post(
            "/api/jobs",
            json={
                "title": "Platform Engineer",
                "company": "Orbit Labs",
                "description": "Build platform services with Python and FastAPI.",
                "required_skills": ["Python", "FastAPI"],
            },
            headers=recruiter_headers,
        )
        assert job_res.status_code == 201
        job_id = job_res.json()["id"]

        resume_content = (
            "Test Person — Platform engineer. Built FastAPI services and "
            "PostgreSQL pipelines used by 40 teams."
        )
        resume_res = await client.post(
            "/api/resumes",
            json={"candidate_name": "Test Person", "content": resume_content},
            headers=candidate_headers,
        )
        assert resume_res.status_code == 201
        resume_id = resume_res.json()["id"]

        match_obj = MatchModel(
            job_id=uuid.UUID(job_id),
            resume_id=uuid.UUID(resume_id),
            similarity_score=0.87,
            bias_reduced=False,
            shortlisted=False,
        )
        db_session.add(match_obj)
        await db_session.commit()
        await db_session.refresh(match_obj)

        return {
            "job_id": job_id,
            "match_id": str(match_obj.id),
            "resume_id": resume_id,
            "resume_content": resume_content,
        }

    @pytest.fixture
    async def other_recruiter_headers(self, client: AsyncClient) -> dict[str, str]:
        resp = await client.post(
            "/api/auth/register/recruiter",
            json=registration_payload(
                "other_recruiter@example.com", company_name="Nebula Inc"
            ),
        )
        assert resp.status_code == 201
        login_resp = await client.post(
            "/api/auth/login",
            json={"email": "other_recruiter@example.com", "password": TEST_PASSWORD},
        )
        assert login_resp.status_code == 200
        return {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

    @pytest.mark.asyncio
    async def test_job_owner_can_open_application(
        self,
        client: AsyncClient,
        recruiter_headers,
        application,
    ):
        resp = await client.get(
            f"/api/jobs/{application['job_id']}/applicants/{application['match_id']}",
            headers=recruiter_headers,
        )
        assert resp.status_code == 200
        data = resp.json()

        assert data["job"]["title"] == "Platform Engineer"
        assert data["job"]["applicant_count"] == 1
        assert data["job"]["shortlisted_count"] == 0
        assert data["match"]["candidate_name"] == "Test Person"
        assert data["match"]["similarity_score"] == pytest.approx(0.87)
        assert data["match"]["shortlisted"] is False
        assert data["resume"]["content"] == application["resume_content"]
        assert data["resume"]["skills"] == ["Python", "FastAPI", "SQL"]

    @pytest.mark.asyncio
    async def test_application_reflects_shortlist_toggle_immediately(
        self,
        client: AsyncClient,
        recruiter_headers,
        application,
    ):
        patch_res = await client.patch(
            f"/api/matches/{application['match_id']}",
            json={"shortlisted": True},
            headers=recruiter_headers,
        )
        assert patch_res.status_code == 200

        resp = await client.get(
            f"/api/jobs/{application['job_id']}/applicants/{application['match_id']}",
            headers=recruiter_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["match"]["shortlisted"] is True
        assert data["job"]["shortlisted_count"] == 1

    @pytest.mark.asyncio
    async def test_application_is_private_to_job_owner(
        self,
        client: AsyncClient,
        other_recruiter_headers,
        candidate_headers,
        application,
    ):
        url = (
            f"/api/jobs/{application['job_id']}/applicants/"
            f"{application['match_id']}"
        )

        other_recruiter = await client.get(url, headers=other_recruiter_headers)
        assert other_recruiter.status_code == 403

        candidate = await client.get(url, headers=candidate_headers)
        assert candidate.status_code == 403

    @pytest.mark.asyncio
    async def test_application_requires_matching_job_and_match(
        self,
        client: AsyncClient,
        recruiter_headers,
        application,
        mock_embedding_service,
        mock_skill_extraction,
    ):
        missing = await client.get(
            f"/api/jobs/{application['job_id']}/applicants/{uuid.uuid4()}",
            headers=recruiter_headers,
        )
        assert missing.status_code == 404

        other_job = await client.post(
            "/api/jobs",
            json={"title": "Other Role", "company": "Orbit Labs", "description": "D"},
            headers=recruiter_headers,
        )
        assert other_job.status_code == 201
        mismatch = await client.get(
            f"/api/jobs/{other_job.json()['id']}/applicants/"
            f"{application['match_id']}",
            headers=recruiter_headers,
        )
        assert mismatch.status_code == 404
