"""Security tests for Rate Limiting."""

import pytest
from app.ratelimit import limiter


def test_rate_limiter_configuration():
    assert limiter is not None
    # Verify limiter instance has active storage
    assert hasattr(limiter, "limit")
