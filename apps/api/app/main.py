import asyncio
import logging
import sys
from contextlib import asynccontextmanager

if sys.platform == "win32" and sys.version_info < (3, 14):
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from app.ratelimit import limiter
from app.routers import (
    admin_router,
    applications_router,
    auth_router,
    events_router,
    jobs_router,
    matches_router,
    notifications_router,
    resumes_router,
    support_router,
)
from app.services.sbert import SBERTService

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load SBERT model once at startup off the event loop
    logger.info("Initializing SBERT service at startup...")
    SBERTService.get_instance()

    # Auto-initialize and seed SQLite database if running in fallback mode
    from app.database import Base, engine
    if "sqlite" in str(engine.url):
        import app.models  # noqa: F401
        from app.seeds.admin import seed_admin
        from app.seeds.jobs import seed_jobs

        logger.info("Initializing SQLite database tables and seed data...")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        try:
            await seed_admin()
        except Exception as exc:
            logger.info("Admin seeding note: %s", exc)
        try:
            await seed_jobs()
        except Exception as exc:
            logger.info("Jobs seeding note: %s", exc)

    yield


app = FastAPI(title="AI Resume Matching API", lifespan=lifespan)
app.state.limiter = limiter

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(jobs_router)
app.include_router(resumes_router)
app.include_router(matches_router)
app.include_router(applications_router)
app.include_router(notifications_router)
app.include_router(admin_router)
app.include_router(support_router)
app.include_router(events_router)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many login attempts. Please try again later."},
    )


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    # Flatten Pydantic's error list into the {"detail": ...} shape the frontend reads.
    errors = exc.errors()
    first = errors[0]["msg"] if errors else "Invalid request"
    return JSONResponse(
        status_code=422,
        content={
            "detail": first.removeprefix("Value error, "),
            "errors": [
                {
                    "field": ".".join(
                        str(part)
                        for part in error["loc"]
                        if isinstance(part, str) and part != "body"
                    ),
                    "message": error["msg"].removeprefix("Value error, "),
                }
                for error in errors
            ],
        },
    )


@app.get("/health")
async def health_check():
    return {"status": "ok"}
