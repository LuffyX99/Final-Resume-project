import asyncio
import sys

from sqlalchemy import func, select

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from app.config import settings
from app.database import async_session
from app.models import User
from app.security import hash_password, password_problem


async def seed_admin() -> None:
    email = settings.admin_email.strip().lower()
    password = settings.admin_password

    if not email or not password:
        raise SystemExit("ADMIN_EMAIL and ADMIN_PASSWORD must be set to seed an admin.")

    problem = password_problem(password)
    if problem:
        raise SystemExit(f"ADMIN_PASSWORD is too weak: {problem}")

    async with async_session() as session:
        stmt = select(User).where(func.lower(User.email) == email)
        existing = (await session.execute(stmt)).scalar_one_or_none()

        if existing is not None:
            if existing.role != "admin":
                raise SystemExit(
                    f"{email} already exists with role '{existing.role}'; "
                    "refusing to promote an existing account."
                )
            existing.password_hash = hash_password(password)
            existing.is_active = True
            await session.commit()
            print(f"Admin account {email} already exists; updated password and verified active.")
            return

        session.add(
            User(
                role="admin",
                full_name=settings.admin_full_name,
                email=email,
                password_hash=hash_password(password),
            )
        )
        await session.commit()
        print(f"Created admin account {email}.")


if __name__ == "__main__":
    asyncio.run(seed_admin())
