"""Unit tests for the EmbeddingService powered by SBERT."""

import math
from unittest.mock import AsyncMock, patch

import pytest

from app.services.embedding import EMBEDDING_DIMENSION, EmbeddingService


@pytest.fixture
def service():
    return EmbeddingService()


class TestTokenCount:
    def test_counts_tokens(self, service):
        count = service._token_count("hello world")
        assert isinstance(count, int)
        assert count == 2

    def test_empty_string(self, service):
        count = service._token_count("")
        assert count == 0


class TestChunkText:
    def test_short_text_returns_single_chunk(self, service):
        chunks = service._chunk_text("short text")
        assert len(chunks) == 1
        assert chunks[0] == "short text"

    def test_long_text_returns_multiple_chunks(self, service):
        # Create text that exceeds the SBERT chunk limit
        long_text = "word " * 500
        chunks = service._chunk_text(long_text)
        assert len(chunks) > 1


class TestGetEmbedding:
    @pytest.mark.asyncio
    async def test_single_chunk_embedding(self, service):
        result = await service.get_embedding("Python backend engineer")
        assert len(result) == EMBEDDING_DIMENSION
        assert EMBEDDING_DIMENSION == 384
        mag = math.sqrt(sum(v * v for v in result))
        assert abs(mag - 1.0) < 1e-4

    @pytest.mark.asyncio
    async def test_empty_text_raises_error(self, service):
        with pytest.raises(ValueError, match="empty text"):
            await service.get_embedding("")

    @pytest.mark.asyncio
    async def test_whitespace_only_raises_error(self, service):
        with pytest.raises(ValueError, match="empty text"):
            await service.get_embedding("   ")

    @pytest.mark.asyncio
    async def test_multi_chunk_embedding(self, service):
        long_text = "software engineer " * 300
        result = await service.get_embedding(long_text)
        assert len(result) == EMBEDDING_DIMENSION
        mag = math.sqrt(sum(v * v for v in result))
        assert abs(mag - 1.0) < 1e-4


class TestWeightedAverage:
    def test_equal_weights(self):
        embeddings = [[1.0, 2.0], [3.0, 4.0]]
        weights = [1, 1]
        result = EmbeddingService._weighted_average(embeddings, weights)
        assert result == [2.0, 3.0]

    def test_unequal_weights(self):
        embeddings = [[0.0, 0.0], [10.0, 10.0]]
        weights = [1, 3]
        result = EmbeddingService._weighted_average(embeddings, weights)
        assert result == [7.5, 7.5]

    def test_single_embedding(self):
        embeddings = [[5.0, 10.0]]
        weights = [1]
        result = EmbeddingService._weighted_average(embeddings, weights)
        assert result == [5.0, 10.0]
