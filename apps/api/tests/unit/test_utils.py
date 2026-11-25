"""Unit tests for Utility Helpers and Security Functions."""

import pytest
from app.security import normalize_phone, hash_password, verify_password
from app.services.integrity.scoring import clamp01, round4


class TestUtils:
    def test_normalize_phone(self):
        assert normalize_phone("+91 98765 43210") == "+919876543210"
        assert normalize_phone("  (987) 654-3210  ") == "9876543210"

    def test_clamp01(self):
        assert clamp01(-0.5) == 0.0
        assert clamp01(1.5) == 1.0
        assert clamp01(0.75) == 0.75

    def test_round4(self):
        assert round4(0.12345678) == 0.1235
        assert round4(1.0) == 1.0

    def test_password_hash_and_verify(self):
        pwd = "SecurePassword2026!"
        h = hash_password(pwd)
        assert verify_password(pwd, h) is True
        assert verify_password("WrongPassword", h) is False
