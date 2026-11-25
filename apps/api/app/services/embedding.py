import logging
from app.config import settings
from app.services.sbert import SBERT_DIMENSION, SBERT_MODEL_NAME, SBERTService

logger = logging.getLogger(__name__)

DEFAULT_MODEL = SBERT_MODEL_NAME
EMBEDDING_DIMENSION = SBERT_DIMENSION


class EmbeddingService:
    """Primary embedding service powered by SBERT (all-MiniLM-L6-v2).

    Produces 384-dimensional unit-normalized semantic embeddings. Runs
    inference in worker threads off the event loop and provides fallback
    when running in offline/isolated environments.
    """

    def __init__(self, model: str = DEFAULT_MODEL):
        self.model = model
        self.dimension = EMBEDDING_DIMENSION
        self.sbert = SBERTService.get_instance()

    async def get_embedding(self, text: str) -> list[float]:
        """Generate embedding off the event loop using SBERT."""
        text = text.strip()
        if not text:
            raise ValueError("Cannot generate embedding for empty text")
        return await self.sbert.get_embedding(text)

    async def get_embeddings_batch(self, texts: list[str]) -> list[list[float]]:
        return await self.sbert.get_embeddings_batch(texts)

    def _token_count(self, text: str) -> int:
        """Token count estimation for chunking."""
        cleaned = text.strip()
        if not cleaned:
            return 0
        return len(cleaned.split())

    def _chunk_text(self, text: str) -> list[str]:
        """Delegate chunking to SBERT service."""
        return self.sbert._chunk_text(text)

    @staticmethod
    def _weighted_average(
        embeddings: list[list[float]], weights: list[int]
    ) -> list[float]:
        """Compute weighted mean of embedding vectors."""
        dim = len(embeddings[0])
        total_weight = sum(weights)
        if total_weight == 0:
            return [0.0] * dim

        result = [0.0] * dim
        for emb, weight in zip(embeddings, weights):
            for i, val in enumerate(emb):
                result[i] += val * weight
        return [v / total_weight for v in result]
