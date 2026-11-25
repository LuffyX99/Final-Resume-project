"""Integration tests for Candidate Dashboard data endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_candidate_dashboard_applications_and_public_jobs(client: AsyncClient, candidate_headers: dict[str, str]):
    # Public jobs browse
    jobs_res = await client.get("/api/jobs", headers=candidate_headers)
    assert jobs_res.status_code == 200
    assert isinstance(jobs_res.json(), list)

    # Candidate's own applications
    apps_res = await client.get("/api/applications/mine", headers=candidate_headers)
    assert apps_res.status_code == 200
    assert isinstance(apps_res.json(), list)
