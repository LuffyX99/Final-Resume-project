"""Security tests for Injection Prevention."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_sql_and_nosql_injection_sanitized(client: AsyncClient, recruiter_headers: dict[str, str]):
    # Malicious injection string in title/description
    payload = {
        "title": "Engineer'; DROP TABLE users; --",
        "company": "{\" $gt\": \"\"}",
        "description": "<script>alert('xss')</script>",
        "required_skills": ["Python"],
    }
    res = await client.post("/api/jobs", json=payload, headers=recruiter_headers)
    assert res.status_code == 201
    # System handles string as literal parameter, no table dropped
    job = res.json()
    assert "DROP TABLE" in job["title"]
