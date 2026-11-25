"""Unit tests for SBERT Embedding Generator."""

import pytest
from app.services.sbert import SBERT_DIMENSION, SBERT_MODEL_NAME, SBERTService


class TestSBERTEmbedder:
    def test_sbert_singleton_instance(self):
        inst1 = SBERTService.get_instance()
        inst2 = SBERTService.get_instance()
        assert inst1 is inst2

    @pytest.mark.asyncio
    async def test_embed_text_returns_384_dimension_vector(self):
        service = SBERTService.get_instance()
        vec = await service.get_embedding("Senior Machine Learning Engineer specializing in PyTorch.")
        
        assert isinstance(vec, list)
        assert len(vec) == SBERT_DIMENSION
        # Check normalized vector magnitude
        norm = sum(x * x for x in vec) ** 0.5
        assert norm == pytest.approx(1.0, abs=1e-3)

    @pytest.mark.asyncio
    async def test_embed_batch_consistency(self):
        service = SBERTService.get_instance()
        texts = ["Python developer with FastAPI experience.", "DevOps engineer with Kubernetes skills."]
        vecs = await service.get_embeddings_batch(texts)
        
        assert len(vecs) == 2
        assert len(vecs[0]) == SBERT_DIMENSION
        assert len(vecs[1]) == SBERT_DIMENSION

    def test_deterministic_token_hash_projection_fallback(self):
        service = SBERTService.get_instance()
        v1 = service._fallback_embedding("Docker container orchestration on AWS cloud.")
        v2 = service._fallback_embedding("Docker container orchestration on AWS cloud.")
        
        assert len(v1) == SBERT_DIMENSION
        assert v1 == v2
