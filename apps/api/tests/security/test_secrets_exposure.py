"""Security tests for Secrets Exposure."""

import pytest
from httpx import AsyncClient
from app.config import settings


@pytest.mark.asyncio
async def test_secrets_not_exposed_in_health_or_api(client: AsyncClient):
    res = await client.get("/health")
    assert res.status_code == 200
    text = res.text
    assert settings.jwt_secret not in text
    assert settings.admin_password not in text
