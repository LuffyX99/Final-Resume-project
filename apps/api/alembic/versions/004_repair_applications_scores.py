"""Repair applications scoring columns dropped by the 006 drift.

The live database reported revision ``006`` while this repository's newest
migration was ``003``. That left ``applications`` without the seven scoring /
audit columns declared by the model and by ``003_platform_schema``, so any ORM
read on the table failed with ``column applications.similarity_score does not
exist`` and the apply pipeline could not write its results.

This migration restores the columns idempotently and re-creates the composite
index that the model expects.

Revision ID: 004
Revises: 003
Create Date: 2026-11-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUMNS: tuple[tuple[str, sa.types.TypeEngine, bool], ...] = (
    ("similarity_score", sa.Float(), True),
    ("trust_score", sa.Float(), True),
    ("trust_flags", sa.JSON(), True),
    ("final_score", sa.Float(), True),
    ("readiness_score", sa.SmallInteger(), True),
    ("skill_gap_analysis", sa.JSON(), True),
    ("audit_trail", sa.JSON(), True),
)


def _existing_columns() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns("applications")}


def _existing_indexes() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {index["name"] for index in inspector.get_indexes("applications")}


def upgrade() -> None:
    present = _existing_columns()
    for name, column_type, nullable in COLUMNS:
        if name not in present:
            op.add_column(
                "applications",
                sa.Column(name, column_type, nullable=nullable),
            )

    if "ix_applications_job_final_score" not in _existing_indexes():
        op.create_index(
            "ix_applications_job_final_score",
            "applications",
            ["job_id", "final_score"],
        )


def downgrade() -> None:
    if "ix_applications_job_final_score" in _existing_indexes():
        op.drop_index("ix_applications_job_final_score", table_name="applications")

    present = _existing_columns()
    for name, _column_type, _nullable in reversed(COLUMNS):
        if name in present:
            op.drop_column("applications", name)
