"""Integration tests for Recruiter Dashboard data endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_recruiter_dashboard_jobs_list(client: AsyncClient, recruiter_headers: dict[str, str]):
    response = await client.get("/api/jobs", headers=recruiter_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)
