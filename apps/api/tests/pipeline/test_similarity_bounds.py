"""Pipeline tests for similarity bounds."""

import pytest
from app.services.matching import cosine_similarity


def test_similarity_bounds_in_zero_to_one():
    # Various vector configurations
    v_pos = [1.0] * 384
    v_neg = [-1.0] * 384
    v_rand = [0.1 * (i % 5) for i in range(384)]

    assert 0.0 <= cosine_similarity(v_pos, v_pos) <= 1.0
    assert 0.0 <= cosine_similarity(v_pos, v_rand) <= 1.0
    assert 0.0 <= cosine_similarity(v_pos, v_neg) <= 1.0
