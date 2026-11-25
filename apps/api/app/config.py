from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


API_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"

# Values that are trivially weak and rejected at startup.
_WEAK_JWT_SECRETS = {
    "change-me-before-deploying",
    "replace-with-a-random-secret",
    "secret",
}
_WEAK_ADMIN_PASSWORDS = {
    "changeme",
    "admin",
    "password",
    "12345678",
}


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://postgres:postgres@db:5432/resume_matching"
    openai_api_key: str = ""

    jwt_secret: str = "epti9FO8vX2OQduZUynzeQkwgB9R5l0Q8u_4RA7EZPCGuTnZhnKFSFgKCI0Mx72-"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    admin_id: str = "admin"
    admin_email: str = "admin.resumematch@gmail.com"
    admin_password: str = "Admin#ResumeMatch2026"
    admin_full_name: str = "Administrator"

    # Upload guard for candidate resumes (5 MiB by default).
    max_resume_bytes: int = 5 * 1024 * 1024

    # Trust-weighted ranking & fraud detection configuration (supports "weighted" and "multiplicative")
    similarity_weight: float = 0.70
    trust_weight: float = 0.30
    min_trust_threshold: float = 0.30
    shortlist_threshold: float = 0.85
    scoring_mode: str = "weighted"

    # Skill gap & readiness analysis configuration
    stale_skill_years_threshold: int = 3
    stale_skill_credit: float = 0.50

    # SMTP Email Configuration
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_email: str = ""  # Alias for SMTP_EMAIL
    smtp_password: str = ""
    smtp_from_email: str = "noreply@resumematch.ai"
    smtp_from_name: str = "ResumeMatch AI"
    smtp_use_tls: bool = True

    # Email OTP Verification
    require_email_otp: bool = False
    otp_expiry_minutes: int = 5
    otp_cooldown_seconds: int = 60
    otp_max_attempts: int = 5

    model_config = SettingsConfigDict(
        env_file=API_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @model_validator(mode="after")
    def _guard_secrets(self) -> "Settings":
        if len(self.jwt_secret) < 32 or self.jwt_secret in _WEAK_JWT_SECRETS:
            raise ValueError(
                "JWT_SECRET must be at least 32 characters and not a published "
                "default. Generate one with: python -c \"import secrets; "
                "print(secrets.token_urlsafe(48))\""
            )
        if (
            len(self.admin_password) < 12
            or self.admin_password in _WEAK_ADMIN_PASSWORDS
        ):
            raise ValueError(
                "ADMIN_PASSWORD must be at least 12 characters and not a "
                "published default."
            )
        return self


settings = Settings()
