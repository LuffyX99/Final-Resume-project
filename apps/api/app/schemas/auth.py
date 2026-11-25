import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.security import PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, normalize_phone, password_problem


class LoginRequest(BaseModel):
    # Login is a lookup, not a registration: any address already stored must be
    # able to sign in, even if it uses a reserved domain.
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(repr=False)

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class UserResponse(BaseModel):
    id: uuid.UUID
    role: str
    full_name: str
    email: str
    age: int | None = None
    gender: str | None = None
    phone_number: str | None = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class SendOTPRequest(BaseModel):
    email: EmailStr
    full_name: str | None = None

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class SendOTPResponse(BaseModel):
    message: str
    cooldown_seconds: int
    expires_in: int


class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=6, max_length=6)

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("otp")
    @classmethod
    def _validate_digits(cls, value: str) -> str:
        val = value.strip()
        if not val.isdigit() or len(val) != 6:
            raise ValueError("OTP must be exactly 6 digits.")
        return val


class VerifyOTPResponse(BaseModel):
    message: str
    verification_token: str


class CandidateRegister(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    age: int = Field(ge=18, le=100)
    gender: str = Field(min_length=1, max_length=32)
    email: EmailStr
    phone_number: str
    password: str = Field(
        min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH, repr=False
    )
    confirm_password: str = Field(repr=False)
    verification_token: str | None = None
    otp: str | None = None

    # Reject unknown keys so a caller cannot smuggle in a role or an id.
    model_config = {"extra": "forbid"}

    @field_validator("full_name", "gender")
    @classmethod
    def _clean_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("This field cannot be empty.")
        return cleaned

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, value: str) -> str:
        return value.lower()

    @field_validator("phone_number")
    @classmethod
    def _normalize_phone(cls, value: str) -> str:
        normalized = normalize_phone(value)
        if normalized is None:
            raise ValueError("Phone number is required.")
        return normalized

    @field_validator("password")
    @classmethod
    def _check_strength(cls, value: str) -> str:
        problem = password_problem(value)
        if problem:
            raise ValueError(problem)
        return value

    @model_validator(mode="after")
    def _passwords_match(self) -> "CandidateRegister":
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match.")
        return self


class RecruiterRegister(CandidateRegister):
    company_name: str = Field(min_length=2, max_length=255)
    company_website: str | None = Field(default=None, max_length=255)
    company_size: str | None = Field(default=None, max_length=50)
    industry: str | None = Field(default=None, max_length=100)
    company_location: str | None = Field(default=None, max_length=255)
    company_description: str | None = None
