"""Align persisted embeddings with the 384-dimensional SBERT model.

Some existing databases were stamped at revision 006 while retaining the old
1536-dimensional vector columns. The application now generates 384-dimensional
embeddings, so those columns reject resume submissions. Embeddings are derived
data; clear stale vectors before changing the column dimensions.

Revision ID: 007
Revises: 006
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    for table in ("jobs", "resumes"):
        current_type = bind.execute(
            sa.text(
                "SELECT format_type(a.atttypid, a.atttypmod) "
                "FROM pg_attribute a "
                "WHERE a.attrelid = to_regclass(:table_name) "
                "AND a.attname = 'embedding' "
                "AND a.attnum > 0 AND NOT a.attisdropped"
            ),
            {"table_name": table},
        ).scalar_one_or_none()

        if current_type == "vector(384)":
            continue

        op.execute(f"DROP INDEX IF EXISTS ix_{table}_embedding_hnsw")
        op.execute(f"UPDATE {table} SET embedding = NULL")
        op.execute(
            f"ALTER TABLE {table} ALTER COLUMN embedding TYPE vector(384) "
            "USING embedding::vector(384)"
        )
        op.execute(
            f"CREATE INDEX ix_{table}_embedding_hnsw ON {table} "
            "USING hnsw (embedding vector_cosine_ops) "
            "WITH (m = 16, ef_construction = 64)"
        )


def downgrade() -> None:
    # The previous 1536-dimensional values were cleared during upgrade and
    # cannot be reconstructed from the 384-dimensional vectors.
    pass
