"""Performance benchmark for FAISS vector search latency."""

import time
from app.services.faiss_service import FAISSIndexService


def test_faiss_search_latency_meets_sla():
    index = FAISSIndexService(dimension=384)
    # Populate index with 1,000 vectors for latency benchmarking
    sample_vec = [0.05] * 384
    keys = [f"cand_{i}" for i in range(1000)]
    vectors = [sample_vec] * 1000
    index.add_vectors(keys, vectors)

    query = [0.05] * 384
    start = time.perf_counter()
    results = index.search(query, top_k=10)
    duration = time.perf_counter() - start

    # SLA: search latency < 100ms (0.100s)
    assert duration < 0.100, f"FAISS search latency was {duration*1000:.2f}ms, exceeding 100ms SLA"
    assert len(results) == 10
