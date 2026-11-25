from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import RecruiterProfile, User
from app.ratelimit import limiter
from app.schemas import (
    CandidateRegister,
    LoginRequest,
    RecruiterRegister,
    SendOTPRequest,
    SendOTPResponse,
    TokenResponse,
    UserResponse,
    VerifyOTPRequest,
    VerifyOTPResponse,
)
from app.security import create_access_token, hash_password, verify_password
from app.services.otp_service import otp_service

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Hashing a throwaway value keeps unknown-email logins as slow as known ones.
_DUMMY_PASSWORD_HASH = hash_password("timing-equalizer")


async def _email_taken(db: AsyncSession, email: str) -> bool:
    stmt = select(User.id).where(func.lower(User.email) == email.lower()).limit(1)
    return (await db.execute(stmt)).scalar_one_or_none() is not None


async def _commit_new_user(db: AsyncSession) -> None:
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Email is already registered. Try signing in instead.",
        )


def _issue_session(user: User) -> TokenResponse:
    token, expires_in = create_access_token(user.id, user.role)
    return TokenResponse(
        access_token=token,
        expires_in=expires_in,
        user=UserResponse.model_validate(user),
    )


@router.post("/otp/send", response_model=SendOTPResponse)
@limiter.limit("5/minute")
async def send_registration_otp(
    request: Request, body: SendOTPRequest, db: AsyncSession = Depends(get_db)
):
    result = await otp_service.send_registration_otp(
        db, email=body.email, full_name=body.full_name or ""
    )
    return SendOTPResponse(**result)


@router.post("/otp/verify", response_model=VerifyOTPResponse)
@limiter.limit("10/minute")
async def verify_registration_otp(
    request: Request, body: VerifyOTPRequest, db: AsyncSession = Depends(get_db)
):
    result = await otp_service.verify_registration_otp(
        db, email=body.email, otp=body.otp
    )
    return VerifyOTPResponse(**result)


@router.post(
    "/register/candidate",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register_candidate(
    body: CandidateRegister, db: AsyncSession = Depends(get_db)
):
    if settings.require_email_otp:
        await otp_service.validate_and_consume_verification(
            db,
            email=body.email,
            verification_token=body.verification_token,
            otp=body.otp,
        )

    if await _email_taken(db, body.email):
        raise HTTPException(
            status_code=409,
            detail="Email is already registered. Try signing in instead.",
        )

    user = User(
        role="candidate",
        full_name=body.full_name,
        age=body.age,
        gender=body.gender,
        email=body.email,
        phone_number=body.phone_number,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    await _commit_new_user(db)
    await db.refresh(user)
    return _issue_session(user)


@router.post(
    "/register/recruiter",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register_recruiter(
    body: RecruiterRegister, db: AsyncSession = Depends(get_db)
):
    if settings.require_email_otp:
        await otp_service.validate_and_consume_verification(
            db,
            email=body.email,
            verification_token=body.verification_token,
            otp=body.otp,
        )

    if await _email_taken(db, body.email):
        raise HTTPException(
            status_code=409,
            detail="Email is already registered. Try signing in instead.",
        )

    user = User(
        role="recruiter",
        full_name=body.full_name,
        age=body.age,
        gender=body.gender,
        email=body.email,
        phone_number=body.phone_number,
        password_hash=hash_password(body.password),
    )
    user.recruiter_profile = RecruiterProfile(
        company_name=body.company_name,
        company_website=body.company_website,
        company_size=body.company_size,
        industry=body.industry,
        company_location=body.company_location,
        company_description=body.company_description,
    )
    db.add(user)
    await _commit_new_user(db)
    await db.refresh(user)
    return _issue_session(user)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(
    request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)
):
    stmt = select(User).where(func.lower(User.email) == body.email.lower())
    user = (await db.execute(stmt)).scalar_one_or_none()

    password_hash = user.password_hash if user is not None else _DUMMY_PASSWORD_HASH
    if not verify_password(body.password, password_hash) or user is None:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(
            status_code=403, detail="This account has been deactivated"
        )

    return _issue_session(user)


@router.get("/me", response_model=UserResponse)
async def read_current_user(user: User = Depends(get_current_user)):
    return user
