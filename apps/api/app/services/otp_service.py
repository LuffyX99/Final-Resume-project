import hashlib
import hmac
import logging
import secrets
import string
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import EmailOTP, User
from app.services.email import email_service

logger = logging.getLogger(__name__)


def ensure_utc(dt: datetime) -> datetime:
    """Ensure datetime has UTC timezone for cross-database compatibility."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def generate_otp(length: int = 6) -> str:
    """Generate a cryptographically secure numeric OTP."""
    digits = string.digits
    return "".join(secrets.choice(digits) for _ in range(length))


def hash_otp(otp: str, email: str) -> str:
    """Compute HMAC-SHA256 digest of the OTP bound to normalized email."""
    secret = settings.jwt_secret.encode("utf-8")
    payload = f"{email.strip().lower()}:{otp.strip()}".encode("utf-8")
    return hmac.new(secret, payload, hashlib.sha256).hexdigest()


def verify_otp_hash(otp: str, email: str, otp_hash: str) -> bool:
    """Constant-time comparison of OTP hash."""
    computed = hash_otp(otp, email)
    return hmac.compare_digest(computed, otp_hash)


def create_verification_token(email: str) -> str:
    """Create a signed, short-lived JWT proving email verification."""
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=15)
    payload = {
        "sub": email.strip().lower(),
        "purpose": "email_verification",
        "iat": int(now.timestamp()),
        "exp": int(expires.timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_verification_token(token: str, expected_email: str) -> bool:
    """Verify that the token was signed by us and matches the email."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
        if payload.get("purpose") != "email_verification":
            return False
        if payload.get("sub") != expected_email.strip().lower():
            return False
        return True
    except (jwt.PyJWTError, Exception):
        return False


class OTPService:
    @staticmethod
    async def send_registration_otp(
        db: AsyncSession, email: str, full_name: str = ""
    ) -> dict[str, int | str]:
        normalized_email = email.strip().lower()

        # 1. Check if user already exists
        stmt = select(User.id).where(func.lower(User.email) == normalized_email).limit(1)
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email is already registered. Try signing in instead.",
            )

        now = datetime.now(timezone.utc)

        # 2. Check cooldown on latest unconsumed request
        stmt_latest = (
            select(EmailOTP)
            .where(
                func.lower(EmailOTP.email) == normalized_email,
                EmailOTP.consumed_at.is_(None),
            )
            .order_by(EmailOTP.created_at.desc())
            .limit(1)
        )
        latest = (await db.execute(stmt_latest)).scalar_one_or_none()
        if latest is not None and ensure_utc(latest.cooldown_until) > now:
            remaining = int((ensure_utc(latest.cooldown_until) - now).total_seconds()) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Please wait {remaining} seconds before requesting a new verification code.",
            )

        # 3. Invalidate/expire any prior unverified records for this email
        # by generating a fresh single-use code
        code = generate_otp(6)
        hashed = hash_otp(code, normalized_email)

        expires_at = now + timedelta(minutes=settings.otp_expiry_minutes)
        cooldown_until = now + timedelta(seconds=settings.otp_cooldown_seconds)

        otp_record = EmailOTP(
            email=normalized_email,
            otp_hash=hashed,
            purpose="registration",
            attempts=0,
            is_verified=False,
            expires_at=expires_at,
            cooldown_until=cooldown_until,
            created_at=now,
        )
        db.add(otp_record)
        await db.commit()

        # 4. Dispatch Email off the main loop
        await email_service.send_otp_email(
            to_email=normalized_email,
            otp_code=code,
            recipient_name=full_name,
            expires_minutes=settings.otp_expiry_minutes,
        )

        return {
            "message": "Verification code sent to your email.",
            "cooldown_seconds": settings.otp_cooldown_seconds,
            "expires_in": settings.otp_expiry_minutes * 60,
        }

    @staticmethod
    async def verify_registration_otp(
        db: AsyncSession, email: str, otp: str
    ) -> dict[str, str]:
        normalized_email = email.strip().lower()
        now = datetime.now(timezone.utc)

        # Find latest unconsumed record for this email
        stmt = (
            select(EmailOTP)
            .where(
                func.lower(EmailOTP.email) == normalized_email,
                EmailOTP.consumed_at.is_(None),
            )
            .order_by(EmailOTP.created_at.desc())
            .limit(1)
        )
        record = (await db.execute(stmt)).scalar_one_or_none()

        if record is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No verification code was requested for this email. Please request an OTP first.",
            )

        if ensure_utc(record.expires_at) < now:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Verification code has expired. Please request a new code.",
            )

        if record.attempts >= settings.otp_max_attempts:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Maximum verification attempts exceeded. Please request a new code.",
            )

        # Validate OTP
        if not verify_otp_hash(otp, normalized_email, record.otp_hash):
            record.attempts += 1
            await db.commit()
            remaining = max(0, settings.otp_max_attempts - record.attempts)
            if remaining == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Maximum verification attempts exceeded. Please request a new code.",
                )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid verification code. {remaining} attempt(s) remaining.",
            )

        # Successfully verified!
        record.is_verified = True
        record.verified_at = now
        await db.commit()

        token = create_verification_token(normalized_email)
        return {
            "message": "Email verified successfully.",
            "verification_token": token,
        }

    @staticmethod
    async def validate_and_consume_verification(
        db: AsyncSession,
        email: str,
        verification_token: str | None = None,
        otp: str | None = None,
    ) -> bool:
        """Ensure the email is verified and consume the verification record."""
        normalized_email = email.strip().lower()
        now = datetime.now(timezone.utc)

        # Case A: Verification token provided
        if verification_token:
            if not decode_verification_token(verification_token, normalized_email):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid or expired email verification token. Please verify your email again.",
                )
            # Find and consume the verified record
            stmt = (
                select(EmailOTP)
                .where(
                    func.lower(EmailOTP.email) == normalized_email,
                    EmailOTP.is_verified.is_(True),
                    EmailOTP.consumed_at.is_(None),
                )
                .order_by(EmailOTP.created_at.desc())
                .limit(1)
            )
            record = (await db.execute(stmt)).scalar_one_or_none()
            if record is not None:
                record.consumed_at = now
                await db.commit()
            return True

        # Case B: Direct OTP provided at registration submission
        if otp:
            stmt = (
                select(EmailOTP)
                .where(
                    func.lower(EmailOTP.email) == normalized_email,
                    EmailOTP.consumed_at.is_(None),
                )
                .order_by(EmailOTP.created_at.desc())
                .limit(1)
            )
            record = (await db.execute(stmt)).scalar_one_or_none()
            if record is None or ensure_utc(record.expires_at) < now:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Verification code is invalid or expired.",
                )
            if not verify_otp_hash(otp, normalized_email, record.otp_hash):
                record.attempts += 1
                await db.commit()
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid verification code.",
                )
            record.is_verified = True
            record.verified_at = now
            record.consumed_at = now
            await db.commit()
            return True

        # Case C: Neither provided - check if enforcement is active
        if settings.require_email_otp:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email address must be verified via OTP before registration can be completed.",
            )

        return True


otp_service = OTPService()
