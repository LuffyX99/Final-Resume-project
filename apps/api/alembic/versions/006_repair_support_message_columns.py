"""Align ``support_messages`` with the model used by the helpdesk.

The drifted table stored a single ``message`` column, while the ORM and the
support service read ``content``, ``sender_role`` and ``sender_name``. Reading a
thread raised ``column support_messages.content does not exist``.

Existing rows (if any) keep their text: ``message`` is copied into ``content``
before the legacy column is dropped.

Revision ID: 006
Revises: 005
Create Date: 2026-11-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns("support_messages")}


def upgrade() -> None:
    present = _columns()

    if "sender_role" not in present:
        op.add_column(
            "support_messages",
            sa.Column("sender_role", sa.String(20), nullable=True),
        )
    if "sender_name" not in present:
        op.add_column(
            "support_messages",
            sa.Column("sender_name", sa.String(255), nullable=True),
        )
    if "content" not in present:
        op.add_column(
            "support_messages",
            sa.Column("content", sa.Text(), nullable=True),
        )

    bind = op.get_bind()
    present = _columns()

    if "sender_role" in present:
        bind.execute(
            sa.text(
                "UPDATE support_messages SET sender_role = 'candidate' "
                "WHERE sender_role IS NULL"
            )
        )
        op.alter_column(
            "support_messages",
            "sender_role",
            existing_type=sa.String(20),
            nullable=False,
        )

    if "sender_name" in present:
        bind.execute(
            sa.text(
                "UPDATE support_messages SET sender_name = 'Unknown' "
                "WHERE sender_name IS NULL"
            )
        )
        op.alter_column(
            "support_messages",
            "sender_name",
            existing_type=sa.String(255),
            nullable=False,
        )

    if "content" in present and "message" in present:
        bind.execute(
            sa.text(
                "UPDATE support_messages SET content = message "
                "WHERE content IS NULL"
            )
        )

    if "content" in present:
        bind.execute(
            sa.text(
                "UPDATE support_messages SET content = '' WHERE content IS NULL"
            )
        )
        op.alter_column(
            "support_messages",
            "content",
            existing_type=sa.Text(),
            nullable=False,
        )

    if "message" in present:
        op.drop_column("support_messages", "message")


def downgrade() -> None:
    present = _columns()

    if "message" not in present:
        op.add_column(
            "support_messages",
            sa.Column("message", sa.Text(), nullable=True),
        )
        bind = op.get_bind()
        if "content" in present:
            bind.execute(
                sa.text(
                    "UPDATE support_messages SET message = content "
                    "WHERE message IS NULL"
                )
            )
            op.alter_column(
                "support_messages",
                "message",
                existing_type=sa.Text(),
                nullable=False,
            )

    for column in ("content", "sender_name", "sender_role"):
        if column in _columns():
            op.drop_column("support_messages", column)
