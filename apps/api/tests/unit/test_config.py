"""Unit tests for Settings and Configuration."""

import pytest
from app.config import Settings, settings


class TestConfig:
    def test_default_settings_loaded(self):
        assert settings.admin_id == "admin"
        assert settings.similarity_weight == 0.70
        assert settings.trust_weight == 0.30
        assert settings.min_trust_threshold == 0.30
        assert settings.shortlist_threshold == 0.85

    def test_weak_jwt_secret_rejected(self):
        with pytest.raises(ValueError, match="JWT_SECRET must be at least"):
            Settings(jwt_secret="secret", admin_password="ValidAdminPassword123")

    def test_weak_admin_password_rejected(self):
        with pytest.raises(ValueError, match="ADMIN_PASSWORD must be at least"):
            Settings(
                jwt_secret="a_valid_jwt_secret_with_more_than_32_characters_here",
                admin_password="admin",
            )
