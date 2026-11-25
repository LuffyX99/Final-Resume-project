"""Unit tests for Cosine Similarity numerical correctness and edge cases."""

import pytest
from app.services.matching import cosine_similarity


class TestCosineSimilarity:
    def test_identical_vectors_have_similarity_one(self):
        v = [0.2, 0.4, 0.6, 0.8]
        score = cosine_similarity(v, v)
        assert score == pytest.approx(1.0, abs=1e-4)

    def test_orthogonal_vectors_have_similarity_zero(self):
        v1 = [1.0, 0.0, 0.0]
        v2 = [0.0, 1.0, 0.0]
        score = cosine_similarity(v1, v2)
        assert score == pytest.approx(0.0, abs=1e-4)

    def test_zero_vector_returns_zero_gracefully(self):
        v_zero = [0.0, 0.0, 0.0]
        v_real = [1.0, 2.0, 3.0]
        assert cosine_similarity(v_zero, v_real) == 0.0
        assert cosine_similarity(v_zero, v_zero) == 0.0

    def test_empty_or_mismatched_dimensions_return_zero(self):
        assert cosine_similarity([], [1.0, 2.0]) == 0.0
        assert cosine_similarity(None, [1.0]) == 0.0
        assert cosine_similarity([1.0], [1.0, 2.0]) == 0.0

    def test_clamped_bounds_between_zero_and_one(self):
        score = cosine_similarity([1.0, -1.0], [-1.0, 1.0])
        assert 0.0 <= score <= 1.0
