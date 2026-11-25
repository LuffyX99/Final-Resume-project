"""Integration tests for Job Match Rankings endpoint."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_job_rankings_empty(client: AsyncClient, recruiter_headers: dict[str, str]):
    job_res = await client.post(
        "/api/jobs",
        json={"title": "Data Scientist", "company": "AnalyticsCorp", "description": "NLP and ML", "required_skills": ["Python", "NLP"]},
        headers=recruiter_headers,
    )
    assert job_res.status_code == 201
    job_id = job_res.json()["id"]

    response = await client.get(f"/api/jobs/{job_id}/matches", headers=recruiter_headers)
    assert response.status_code == 200
    assert response.json() == []
