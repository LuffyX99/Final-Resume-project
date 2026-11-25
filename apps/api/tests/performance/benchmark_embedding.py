"""Performance benchmark for SBERT Embedding latency."""

import time
import pytest
from app.services.sbert import SBERTService


@pytest.mark.asyncio
async def test_embedding_latency_meets_sla():
    service = SBERTService.get_instance()
    text = (
        "Senior Platform Engineer with 8 years experience building cloud infrastructure, "
        "Kubernetes orchestration, Terraform automation, and microservices in Python."
    )
    start = time.perf_counter()
    _ = await service.get_embedding(text)
    duration = time.perf_counter() - start

    # SLA: < 2.0s per resume
    assert duration < 2.0, f"Embedding latency was {duration:.3f}s, exceeding 2s SLA"
