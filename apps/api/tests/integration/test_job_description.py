"""Integration tests for Job Description endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_and_fetch_job(client: AsyncClient, recruiter_headers: dict[str, str]):
    payload = {
        "title": "Senior AI Systems Engineer",
        "company": "NextGen AI",
        "description": "Design and build scalable vector search pipelines.",
        "required_skills": ["Python", "FastAPI", "PyTorch"],
    }
    response = await client.post("/api/jobs", json=payload, headers=recruiter_headers)
    assert response.status_code == 201
    job = response.json()
    assert job["title"] == "Senior AI Systems Engineer"
    job_id = job["id"]

    # Fetch job by ID
    get_res = await client.get(f"/api/jobs/{job_id}", headers=recruiter_headers)
    assert get_res.status_code == 200
    assert get_res.json()["company"] == "NextGen AI"
