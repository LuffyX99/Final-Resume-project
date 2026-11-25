"""Integration tests for Matching endpoint."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_compute_matches_requires_valid_job(client: AsyncClient, recruiter_headers: dict[str, str]):
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await client.post("/api/matches/compute", json={"job_id": fake_id}, headers=recruiter_headers)
    assert response.status_code == 404
