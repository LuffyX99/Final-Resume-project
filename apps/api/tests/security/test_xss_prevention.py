"""Security tests for XSS Prevention."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_xss_payload_treated_as_plain_text(client: AsyncClient, recruiter_headers: dict[str, str]):
    payload = {
        "title": "<img src=x onerror=alert(1)>",
        "company": "SecureCorp",
        "description": "Standard job description.",
        "required_skills": ["Security"],
    }
    res = await client.post("/api/jobs", json=payload, headers=recruiter_headers)
    assert res.status_code == 201
    data = res.json()
    # Content is safely returned as JSON text, not HTML rendered
    assert "<img src=x" in data["title"]
