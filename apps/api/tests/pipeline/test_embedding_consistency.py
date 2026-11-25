"""Pipeline tests for embedding consistency and determinism."""

import pytest
from app.services.sbert import SBERTService


@pytest.mark.asyncio
async def test_embedding_consistency_same_text():
    service = SBERTService.get_instance()
    text = "Cloud Infrastructure Engineer specializing in Kubernetes and Terraform."
    v1 = await service.get_embedding(text)
    v2 = await service.get_embedding(text)
    assert v1 == v2
