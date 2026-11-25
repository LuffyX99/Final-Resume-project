import asyncio
import json
import logging
from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Callable, Coroutine

logger = logging.getLogger(__name__)

EventHandler = Callable[[str, dict[str, Any]], Coroutine[Any, Any, None]]


@dataclass
class UserSubscriber:
    user_id: str
    role: str
    queue: asyncio.Queue


class EventDispatcher:
    """Asynchronous in-memory event bus with ACL-scoped real-time broadcasting."""

    _instance: "EventDispatcher | None" = None

    def __init__(self) -> None:
        self._handlers: dict[str, list[EventHandler]] = defaultdict(list)
        self._user_subscribers: list[UserSubscriber] = []
        self._history: list[dict[str, Any]] = []

    @classmethod
    def get_instance(cls) -> "EventDispatcher":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def subscribe(self, event_name: str, handler: EventHandler) -> None:
        """Register an async handler for a given event name."""
        self._handlers[event_name].append(handler)

    def unsubscribe(self, event_name: str, handler: EventHandler) -> None:
        """Remove a previously registered handler."""
        if event_name in self._handlers and handler in self._handlers[event_name]:
            self._handlers[event_name].remove(handler)

    def subscribe_user(
        self, user_id: str, role: str, queue: asyncio.Queue
    ) -> Callable[[], None]:
        """Register a user connection to receive role/identity filtered events."""
        sub = UserSubscriber(user_id=str(user_id), role=str(role), queue=queue)
        self._user_subscribers.append(sub)

        def _unsubscribe() -> None:
            if sub in self._user_subscribers:
                self._user_subscribers.remove(sub)

        return _unsubscribe

    @staticmethod
    def _can_user_receive(
        sub: UserSubscriber, event_name: str, payload: dict[str, Any]
    ) -> bool:
        """Evaluate access-control rules to prevent event leakage."""
        # Admins have global visibility across all system events
        if sub.role == "admin":
            return True

        # Public job events are broadcast to all authenticated users
        if event_name in ("job.created", "job.updated", "job.closed", "job.taken_down"):
            return True

        # Direct recipient match
        if str(payload.get("user_id", "")) == sub.user_id:
            return True
        if str(payload.get("recipient_id", "")) == sub.user_id:
            return True
        if str(payload.get("candidate_id", "")) == sub.user_id:
            return True
        if str(payload.get("recruiter_id", "")) == sub.user_id:
            return True
        if str(payload.get("sender_id", "")) == sub.user_id:
            return True

        # Target ID list
        target_ids = payload.get("target_user_ids")
        if target_ids and isinstance(target_ids, (list, set, tuple)):
            if sub.user_id in [str(tid) for tid in target_ids]:
                return True

        return False

    async def emit(self, event_name: str, payload: dict[str, Any]) -> None:
        """Emit an event to handlers and authorized user subscribers."""
        record = {"event": event_name, "payload": payload}
        self._history.append(record)
        if len(self._history) > 1000:
            self._history.pop(0)

        # 1. Dispatch to registered callbacks
        handlers = list(self._handlers.get(event_name, []))
        for handler in handlers:
            try:
                res = handler(event_name, payload)
                if asyncio.iscoroutine(res):
                    await res
            except Exception as exc:
                logger.error(
                    "Error in handler for event '%s': %s", event_name, exc, exc_info=True
                )

        # 2. Dispatch to user streaming queues
        for sub in list(self._user_subscribers):
            if self._can_user_receive(sub, event_name, payload):
                try:
                    if sub.queue.full():
                        try:
                            sub.queue.get_nowait()
                        except asyncio.QueueEmpty:
                            pass
                    sub.queue.put_nowait(record)
                except Exception as exc:
                    logger.warning("Failed to deliver event to user %s: %s", sub.user_id, exc)

    def get_history(self, event_name: str | None = None) -> list[dict[str, Any]]:
        if event_name is None:
            return list(self._history)
        return [h for h in self._history if h["event"] == event_name]

    def clear(self) -> None:
        self._history.clear()
        self._handlers.clear()
        self._user_subscribers.clear()


event_dispatcher = EventDispatcher.get_instance()
