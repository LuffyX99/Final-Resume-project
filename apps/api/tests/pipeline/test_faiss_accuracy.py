"""Pipeline tests for FAISS vector search accuracy."""

import pytest
from app.services.faiss_service import FAISSIndexService


def test_faiss_nearest_neighbor_accuracy():
    index = FAISSIndexService(dimension=384)
    # Generate 10 orthogonal-ish base vectors
    for i in range(10):
        vec = [0.0] * 384
        vec[i] = 1.0
        index.add_vector(f"item_{i}", vec)

    # Query with item 4 + slight noise
    query = [0.0] * 384
    query[4] = 0.99
    query[0] = 0.05

    results = index.search(query, top_k=3)
    assert results[0]["id"] == "item_4"
    assert results[0]["score"] > 0.90
