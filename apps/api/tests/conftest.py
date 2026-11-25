import asyncio
import sys
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.models import User
from app.ratelimit import limiter
from app.security import hash_password

settings.openai_api_key = ""
settings.require_email_otp = False

# SQLite keeps the suite dependency-free. Vector operators are not available
# there, so anything touching pgvector is mocked.
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"
TEST_PASSWORD = "Str0ng!Passw0rd"

engine = create_async_engine(TEST_DATABASE_URL)
TestingSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


@pytest.fixture
async def setup_database():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture(autouse=True)
def disable_rate_limit():
    limiter.reset()
    limiter.enabled = False
    yield
    limiter.enabled = True
    limiter.reset()


@pytest.fixture
async def db_session(setup_database) -> AsyncGenerator[AsyncSession]:
    async with TestingSessionLocal() as session:
        yield session


@pytest.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient]:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c

    app.dependency_overrides.clear()


def registration_payload(email: str, **overrides) -> dict:
    payload = {
        "full_name": "Test Person",
        "age": 30,
        "gender": "prefer_not_to_say",
        "email": email,
        "phone_number": "+919876543210",
        "password": TEST_PASSWORD,
        "confirm_password": TEST_PASSWORD,
    }
    payload.update(overrides)
    return payload


async def _login(client: AsyncClient, email: str) -> dict[str, str]:
    response = await client.post(
        "/api/auth/login", json={"email": email, "password": TEST_PASSWORD}
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def candidate_headers(client: AsyncClient) -> dict[str, str]:
    response = await client.post(
        "/api/auth/register/candidate",
        json=registration_payload("candidate@example.com"),
    )
    assert response.status_code == 201, response.text
    return await _login(client, "candidate@example.com")


@pytest.fixture
async def recruiter_headers(client: AsyncClient) -> dict[str, str]:
    response = await client.post(
        "/api/auth/register/recruiter",
        json=registration_payload(
            "recruiter@example.com", company_name="Acme Corp"
        ),
    )
    assert response.status_code == 201, response.text
    return await _login(client, "recruiter@example.com")


@pytest.fixture
async def admin_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    # Public registration can never produce an admin, so seed one directly.
    db_session.add(
        User(
            role="admin",
            full_name="Test Admin",
            email="admin@example.com",
            password_hash=hash_password(TEST_PASSWORD),
        )
    )
    await db_session.commit()
    return await _login(client, "admin@example.com")


@pytest.fixture
def mock_embedding():
    return [0.01 * i for i in range(384)]


@pytest.fixture
def mock_embedding_service(mock_embedding):
    with patch(
        "app.services.embedding.EmbeddingService.get_embedding",
        new_callable=AsyncMock,
        return_value=mock_embedding,
    ) as m, patch(
        "app.routers.jobs.job_service.embedding_service.get_embedding",
        new_callable=AsyncMock,
        return_value=mock_embedding,
    ):
        yield m


@pytest.fixture
def mock_skill_extraction():
    with patch(
        "app.services.skill_extraction.SkillExtractionService.extract_skills",
        new_callable=AsyncMock,
        return_value=["Python", "FastAPI", "SQL"],
    ) as m, patch(
        "app.routers.jobs.job_service.skill_service.extract_skills",
        new_callable=AsyncMock,
        return_value=["Python", "FastAPI", "SQL"],
    ):
        yield m
