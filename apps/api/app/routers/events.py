import asyncio
import json
import logging
import uuid
from typing import AsyncGenerator

import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User
from app.security import decode_access_token
from app.services.events import event_dispatcher

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/events", tags=["events"])
_bearer = HTTPBearer(auto_error=False)


async def get_stream_user(
    token: str | None = Query(None),
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Authenticate user for SSE via either query parameter or Bearer header."""
    raw_token = credentials.credentials if credentials else token
    if not raw_token:
        raise HTTPException(
            status_code=401,
            detail="Authentication token required for real-time stream",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_access_token(raw_token)
        user_id = uuid.UUID(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired stream token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.is_active:
        raise HTTPException(
            status_code=403, detail="This account has been deactivated"
        )

    return user


@router.get("/stream")
async def events_stream(
    request: Request,
    current_user: User = Depends(get_stream_user),
) -> StreamingResponse:
    """Server-Sent Events endpoint streaming real-time role-scoped platform updates.

    Supports native browser auto-reconnect, keep-alive heartbeat comments,
    and automatic queue unsubscription upon client disconnect.
    """
    queue: asyncio.Queue = asyncio.Queue(maxsize=100)
    unsubscribe = event_dispatcher.subscribe_user(
        user_id=str(current_user.id),
        role=current_user.role,
        queue=queue,
    )

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            # Send initial confirmation event to verify connection is open
            initial_payload = {
                "status": "connected",
                "user_id": str(current_user.id),
                "role": current_user.role,
            }
            yield f"event: connected\ndata: {json.dumps(initial_payload)}\n\n"

            while True:
                try:
                    # Wait up to 15 seconds for an event
                    record = await asyncio.wait_for(queue.get(), timeout=15.0)
                    event_name = record.get("event", "message")
                    payload = record.get("payload", {})
                    yield f"event: {event_name}\ndata: {json.dumps(payload)}\n\n"
                except asyncio.TimeoutError:
                    # Yield SSE comment line as heartbeat / keep-alive
                    yield ": keep-alive\n\n"
        except asyncio.CancelledError:
            logger.debug("SSE stream cancelled for user %s", current_user.id)
        finally:
            unsubscribe()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
