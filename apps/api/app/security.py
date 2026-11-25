import re
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.config import settings

PASSWORD_MIN_LENGTH = 10
PASSWORD_MAX_LENGTH = 128
PHONE_PATTERN = re.compile(r"^\+?\d{10,15}$")
PHONE_SEPARATORS = str.maketrans("", "", " -().")

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def password_problem(password: str) -> str | None:
    """Return a user-facing message when the password is too weak."""
    if len(password) < PASSWORD_MIN_LENGTH:
        return f"Password must be at least {PASSWORD_MIN_LENGTH} characters long."

    character_classes = [
        any(char.islower() for char in password),
        any(char.isupper() for char in password),
        any(char.isdigit() for char in password),
        any(not char.isalnum() for char in password),
    ]
    if sum(character_classes) < 3:
        return (
            "Password must combine at least three of: lowercase letters, "
            "uppercase letters, digits, symbols."
        )
    return None


def normalize_phone(value: str | None) -> str | None:
    if value is None:
        return None

    digits = value.translate(PHONE_SEPARATORS)
    if not digits:
        return None
    if not PHONE_PATTERN.fullmatch(digits):
        raise ValueError(
            "Phone number must contain 10 to 15 digits, optionally prefixed with +."
        )
    return digits


def create_access_token(user_id: uuid.UUID, role: str) -> tuple[str, int]:
    expires_in = settings.access_token_expire_minutes * 60
    issued_at = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": issued_at,
        "exp": issued_at + timedelta(seconds=expires_in),
        "jti": uuid.uuid4().hex,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, expires_in


def create_admin_token(admin_id: str) -> tuple[str, int]:
    expires_in = settings.access_token_expire_minutes * 60
    issued_at = datetime.now(timezone.utc)
    payload = {
        "sub": f"admin:{admin_id}",
        "admin_id": admin_id,
        "role": "admin",
        "is_admin": True,
        "iat": issued_at,
        "exp": issued_at + timedelta(seconds=expires_in),
        "jti": uuid.uuid4().hex,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, expires_in


def decode_access_token(token: str) -> dict:
    return jwt.decode(
        token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
    )
