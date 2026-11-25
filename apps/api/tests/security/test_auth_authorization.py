"""Security tests for Role Authorization Separation."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_candidate_cannot_post_job(client: AsyncClient, candidate_headers: dict[str, str]):
    payload = {"title": "Unauthorized Job", "company": "Fake", "description": "Desc"}
    res = await client.post("/api/jobs", json=payload, headers=candidate_headers)
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_recruiter_cannot_submit_application(client: AsyncClient, recruiter_headers: dict[str, str]):
    res = await client.post("/api/applications", data={"job_id": "none"}, headers=recruiter_headers)
    assert res.status_code == 403
