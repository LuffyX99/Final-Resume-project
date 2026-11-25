import logging
import socket
from urllib.parse import urlparse
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

logger = logging.getLogger(__name__)


def _resolve_database_url(url: str) -> str:
    if not url.startswith("postgres"):
        return url
    host = "localhost"
    port = 5432
    try:
        parsed = urlparse(url)
        host = parsed.hostname or "localhost"
        port = parsed.port or 5432
        with socket.create_connection((host, port), timeout=0.3):
            return url
    except Exception:
        logger.warning(
            "PostgreSQL is unreachable at %s:%s. Falling back to local SQLite database (resume_matching.db).",
            host,
            port,
        )
        return "sqlite+aiosqlite:///resume_matching.db"


database_url = _resolve_database_url(settings.database_url)
engine = create_async_engine(database_url)
async_session = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        yield session

