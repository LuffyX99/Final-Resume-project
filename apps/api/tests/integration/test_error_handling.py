"""Integration tests for API Error Handling & Validation."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_404_not_found_handling(client: AsyncClient, recruiter_headers: dict[str, str]):
    response = await client.get("/api/jobs/00000000-0000-0000-0000-000000000000", headers=recruiter_headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_validation_error_formatting(client: AsyncClient, recruiter_headers: dict[str, str]):
    # Missing required title and description
    response = await client.post("/api/jobs", json={"company": "NoTitleCorp"}, headers=recruiter_headers)
    assert response.status_code == 422
    data = response.json()
    assert "detail" in data
