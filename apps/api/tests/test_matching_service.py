"""Unit tests for the MatchingService."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models import Job, Match, Resume
from app.services.matching import MatchingService, cosine_similarity


@pytest.fixture
def job_id():
    return uuid.uuid4()


@pytest.fixture
def resume_id():
    return uuid.uuid4()


@pytest.fixture
def fake_embedding():
    return [0.01] * 1536


@pytest.fixture
def mock_session():
    """Create a mock AsyncSession."""
    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.execute = AsyncMock()
    return session


class TestCosineSimilarity:
    def test_identical_vectors_score_one(self):
        assert cosine_similarity([0.1, 0.2, 0.3], [0.1, 0.2, 0.3]) == pytest.approx(1.0)

    def test_orthogonal_vectors_score_zero(self):
        assert cosine_similarity([1.0, 0.0], [0.0, 1.0]) == 0.0

    def test_invalid_or_zero_vectors_score_zero(self):
        assert cosine_similarity(None, [1.0]) == 0.0
        assert cosine_similarity([1.0], [1.0, 2.0]) == 0.0
        assert cosine_similarity([0.0, 0.0], [1.0, 2.0]) == 0.0

    def test_clamps_negative_similarity(self):
        assert cosine_similarity([1.0, 0.0], [-1.0, 0.0]) == 0.0


class TestScoreApplication:
    @pytest.mark.asyncio
    async def test_creates_single_match_for_fresh_application(
        self, mock_session, job_id, resume_id
    ):
        job = MagicMock(spec=Job)
        job.id = job_id
        job.embedding = [0.1, 0.2]
        resume = MagicMock(spec=Resume)
        resume.id = resume_id
        resume.embedding = [0.1, 0.2]

        service = MatchingService(mock_session)
        match = await service.score_application(job, resume)

        assert match is not None
        assert match.job_id == job_id
        assert match.resume_id == resume_id
        assert match.similarity_score == pytest.approx(1.0)
        assert match.shortlisted is False
        mock_session.add.assert_called_once_with(match)
        mock_session.flush.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_skips_match_when_embedding_missing(
        self, mock_session, job_id, resume_id
    ):
        job = MagicMock(spec=Job)
        job.id = job_id
        job.embedding = None
        resume = MagicMock(spec=Resume)
        resume.id = resume_id
        resume.embedding = [0.1]

        service = MatchingService(mock_session)
        assert await service.score_application(job, resume) is None
        mock_session.add.assert_not_called()


class TestComputeMatches:
    @pytest.mark.asyncio
    async def test_job_not_found_raises(self, mock_session, job_id):
        mock_session.get = AsyncMock(return_value=None)
        service = MatchingService(mock_session)
        with pytest.raises(ValueError, match="not found"):
            await service.compute_matches(job_id)

    @pytest.mark.asyncio
    async def test_job_no_embedding_raises(self, mock_session, job_id):
        job = MagicMock(spec=Job)
        job.embedding = None
        mock_session.get = AsyncMock(return_value=job)
        service = MatchingService(mock_session)
        with pytest.raises(ValueError, match="no embedding"):
            await service.compute_matches(job_id)

    @pytest.mark.asyncio
    async def test_returns_matches(self, mock_session, job_id, fake_embedding):
        job = MagicMock(spec=Job)
        job.embedding = fake_embedding
        job.title = "Engineer"
        job.company = "Acme"
        job.description = "Build things"
        mock_session.get = AsyncMock(return_value=job)

        resume_ids = [uuid.uuid4(), uuid.uuid4()]
        rows = [(resume_ids[0], 0.1), (resume_ids[1], 0.3)]
        mock_result = MagicMock()
        mock_result.all.return_value = rows
        mock_session.execute = AsyncMock(return_value=mock_result)

        service = MatchingService(mock_session, top_n=2)
        matches = await service.compute_matches(job_id)

        assert len(matches) == 2
        assert isinstance(matches[0], Match)
        assert matches[0].similarity_score == pytest.approx(0.9)
        assert matches[1].similarity_score == pytest.approx(0.7)
        assert mock_session.add.call_count == 2
        mock_session.flush.assert_awaited_once()


class TestComputeMatchesForResume:
    @pytest.mark.asyncio
    async def test_resume_not_found_raises(self, mock_session, resume_id):
        mock_session.get = AsyncMock(return_value=None)
        service = MatchingService(mock_session)
        with pytest.raises(ValueError, match="not found"):
            await service.compute_matches_for_resume(resume_id)

    @pytest.mark.asyncio
    async def test_resume_no_embedding_raises(self, mock_session, resume_id):
        resume = MagicMock(spec=Resume)
        resume.embedding = None
        mock_session.get = AsyncMock(return_value=resume)
        service = MatchingService(mock_session)
        with pytest.raises(ValueError, match="no embedding"):
            await service.compute_matches_for_resume(resume_id)

    @pytest.mark.asyncio
    async def test_returns_matches(self, mock_session, resume_id, fake_embedding):
        resume = MagicMock(spec=Resume)
        resume.embedding = fake_embedding
        resume.content = "Experienced engineer"
        mock_session.get = AsyncMock(return_value=resume)

        job_ids = [uuid.uuid4(), uuid.uuid4()]
        rows = [(job_ids[0], 0.05), (job_ids[1], 0.2)]
        mock_result = MagicMock()
        mock_result.all.return_value = rows
        mock_session.execute = AsyncMock(return_value=mock_result)

        service = MatchingService(mock_session, top_n=2)
        matches = await service.compute_matches_for_resume(resume_id)

        assert len(matches) == 2
        assert matches[0].similarity_score == pytest.approx(0.95)
        assert matches[1].similarity_score == pytest.approx(0.8)
