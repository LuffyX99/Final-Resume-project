from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


API_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://postgres:postgres@db:5432/resume_matching"
    openai_api_key: str = ""

    jwt_secret: str = "change-me-before-deploying"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    admin_id: str = "admin"
    admin_email: str = ""
    admin_password: str = "Admin#ResumeMatch2026"
    admin_full_name: str = "Administrator"

    # Upload guard for candidate resumes (5 MiB by default).
    max_resume_bytes: int = 5 * 1024 * 1024

    # Trust-weighted ranking & fraud detection configuration
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


settings = Settings()
