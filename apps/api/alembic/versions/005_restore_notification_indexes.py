"""Restore notification indexes missing from the drifted database.

``Notification`` declares single-column indexes on ``user_id``, ``job_id``,
``application_id`` and ``is_read``. The live database only had the composite
``ix_notifications_user_created`` / ``ix_notifications_user_read`` indexes, so
inbox and fan-out queries were doing sequential scans.

Revision ID: 005
Revises: 004
Create Date: 2026-11-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEXES: tuple[tuple[str, str], ...] = (
    ("ix_notifications_user_id", "user_id"),
    ("ix_notifications_job_id", "job_id"),
    ("ix_notifications_application_id", "application_id"),
    ("ix_notifications_is_read", "is_read"),
)


def _existing_indexes() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {index["name"] for index in inspector.get_indexes("notifications")}


def upgrade() -> None:
    present = _existing_indexes()
    for name, column in INDEXES:
        if name not in present:
            op.create_index(name, "notifications", [column])


def downgrade() -> None:
    present = _existing_indexes()
    for name, _column in reversed(INDEXES):
        if name in present:
            op.drop_index(name, table_name="notifications")
