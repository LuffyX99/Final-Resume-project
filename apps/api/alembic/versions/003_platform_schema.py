"""Consolidated platform schema: users, recruiter profiles, applications,
notifications, support tickets, and SBERT 384-dimension vector migration.

Revision ID: 003
Revises: 002
Create Date: 2026-11-20
"""
from typing import Sequence, Union

from alembic import op
from pgvector.sqlalchemy import Vector
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEDUPLICATE_MATCHES = """
DELETE FROM matches
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               row_number() OVER (
                   PARTITION BY job_id, resume_id
                   ORDER BY similarity_score DESC, created_at DESC
               ) AS dup_rank
        FROM matches
    ) ranked
    WHERE dup_rank > 1
)
"""


def upgrade() -> None:
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"

    # 1. users table
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("role", sa.String(20), nullable=False, server_default="candidate"),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("age", sa.SmallInteger(), nullable=True),
        sa.Column("gender", sa.String(32), nullable=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("phone_number", sa.String(32), nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "role IN ('candidate', 'recruiter', 'admin')", name="ck_users_role"
        ),
        sa.CheckConstraint(
            "age IS NULL OR (age >= 18 AND age <= 100)", name="ck_users_age"
        ),
    )
    op.create_index(
        "ux_users_email_lower", "users", [sa.text("lower(email)")], unique=True
    )
    op.create_index("ix_users_role_active", "users", ["role", "is_active"])

    # 2. recruiter_profiles table
    op.create_table(
        "recruiter_profiles",
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("company_name", sa.String(255), nullable=False),
        sa.Column("company_website", sa.String(255), nullable=True),
        sa.Column("company_size", sa.String(50), nullable=True),
        sa.Column("industry", sa.String(100), nullable=True),
        sa.Column("company_location", sa.String(255), nullable=True),
        sa.Column("company_description", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # 3. Extend jobs table
    op.add_column("jobs", sa.Column("recruiter_id", sa.Uuid(), nullable=True))
    op.add_column("jobs", sa.Column("required_skills", sa.JSON(), nullable=True))
    op.add_column("jobs", sa.Column("extracted_skills", sa.JSON(), nullable=True))
    op.add_column("jobs", sa.Column("location", sa.String(255), nullable=True))
    op.add_column("jobs", sa.Column("experience", sa.String(100), nullable=True))
    op.add_column("jobs", sa.Column("job_type", sa.String(50), nullable=True))
    op.add_column(
        "jobs",
        sa.Column("status", sa.String(20), server_default="open", nullable=False),
    )
    op.add_column(
        "jobs",
        sa.Column("is_taken_down", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column("jobs", sa.Column("takedown_reason", sa.Text(), nullable=True))
    op.add_column(
        "jobs",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_jobs_recruiter_id_users",
        "jobs",
        "users",
        ["recruiter_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_jobs_status_created_at", "jobs", ["status", "created_at"]
    )
    op.create_index(
        "ix_jobs_recruiter_status", "jobs", ["recruiter_id", "status"]
    )

    # 4. Extend resumes table
    op.add_column("resumes", sa.Column("candidate_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_resumes_candidate_id_users",
        "resumes",
        "users",
        ["candidate_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_resumes_candidate_id", "resumes", ["candidate_id"])

    # 5. Extend matches table
    op.add_column(
        "matches",
        sa.Column(
            "shortlisted", sa.Boolean(), server_default="false", nullable=False
        ),
    )
    if is_postgres:
        op.execute(sa.text(DEDUPLICATE_MATCHES))
    op.create_unique_constraint(
        "uq_matches_job_resume", "matches", ["job_id", "resume_id"]
    )
    op.create_index(
        "ix_matches_job_score", "matches", ["job_id", "similarity_score"]
    )
    op.create_index(
        "ix_matches_resume_score", "matches", ["resume_id", "similarity_score"]
    )
    op.create_index(
        "ix_matches_job_shortlisted", "matches", ["job_id", "shortlisted"]
    )

    # 6. SBERT 384-dimension vector migration
    if is_postgres:
        op.drop_index("ix_jobs_embedding_hnsw", table_name="jobs", if_exists=True)
        op.drop_index("ix_resumes_embedding_hnsw", table_name="resumes", if_exists=True)
        op.execute("UPDATE jobs SET embedding = NULL")
        op.execute("UPDATE resumes SET embedding = NULL")
        op.alter_column(
            "jobs",
            "embedding",
            type_=Vector(384),
            existing_type=Vector(1536),
            nullable=True,
        )
        op.alter_column(
            "resumes",
            "embedding",
            type_=Vector(384),
            existing_type=Vector(1536),
            nullable=True,
        )
        op.create_index(
            "ix_jobs_embedding_hnsw",
            "jobs",
            ["embedding"],
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        )
        op.create_index(
            "ix_resumes_embedding_hnsw",
            "resumes",
            ["embedding"],
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        )

    # 7. applications table
    op.create_table(
        "applications",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "candidate_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "job_id",
            sa.Uuid(),
            sa.ForeignKey("jobs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "resume_id",
            sa.Uuid(),
            sa.ForeignKey("resumes.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.String(20),
            server_default="submitted",
            nullable=False,
        ),
        sa.Column("applicant_name", sa.String(255), nullable=False),
        sa.Column("applicant_email", sa.String(320), nullable=False),
        sa.Column("applicant_phone_number", sa.String(32), nullable=True),
        sa.Column("applicant_age", sa.SmallInteger(), nullable=True),
        sa.Column("applicant_gender", sa.String(32), nullable=True),
        sa.Column("similarity_score", sa.Float(), nullable=True),
        sa.Column("trust_score", sa.Float(), nullable=True),
        sa.Column("trust_flags", sa.JSON(), nullable=True),
        sa.Column("final_score", sa.Float(), nullable=True),
        sa.Column("readiness_score", sa.SmallInteger(), nullable=True),
        sa.Column("skill_gap_analysis", sa.JSON(), nullable=True),
        sa.Column("audit_trail", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "candidate_id", "job_id", name="uq_applications_candidate_job"
        ),
        sa.CheckConstraint(
            "status IN ('submitted', 'shortlisted', 'rejected', 'hired', 'withdrawn')",
            name="ck_applications_status",
        ),
    )
    op.create_index(
        "ix_applications_candidate_created",
        "applications",
        ["candidate_id", "created_at"],
    )
    op.create_index(
        "ix_applications_job_status", "applications", ["job_id", "status"]
    )
    op.create_index(
        "ix_applications_job_final_score",
        "applications",
        ["job_id", "final_score"],
    )

    # 8. notifications table
    op.create_table(
        "notifications",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "sender_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "job_id",
            sa.Uuid(),
            sa.ForeignKey("jobs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "application_id",
            sa.Uuid(),
            sa.ForeignKey("applications.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "notification_type",
            sa.String(50),
            server_default="shortlist_invitation",
            nullable=False,
        ),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column(
            "is_read",
            sa.Boolean(),
            server_default="false",
            nullable=False,
        ),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_notifications_user_read", "notifications", ["user_id", "is_read"]
    )
    op.create_index(
        "ix_notifications_user_created", "notifications", ["user_id", "created_at"]
    )

    # 9. support_threads table
    op.create_table(
        "support_threads",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_role", sa.String(20), nullable=False),
        sa.Column("user_name", sa.String(255), nullable=False),
        sa.Column("user_email", sa.String(320), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column(
            "category", sa.String(50), server_default="general", nullable=False
        ),
        sa.Column(
            "status", sa.String(20), server_default="open", nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('open', 'resolved')", name="ck_support_threads_status"
        ),
    )
    op.create_index(
        "ix_support_threads_status_created",
        "support_threads",
        ["status", "created_at"],
    )
    op.create_index(
        "ix_support_threads_user",
        "support_threads",
        ["user_id", "created_at"],
    )

    # 10. support_messages table
    op.create_table(
        "support_messages",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "thread_id",
            sa.Uuid(),
            sa.ForeignKey("support_threads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "sender_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_support_messages_thread_created",
        "support_messages",
        ["thread_id", "created_at"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"

    # Reverse support
    op.drop_index("ix_support_messages_thread_created", table_name="support_messages")
    op.drop_table("support_messages")
    op.drop_index("ix_support_threads_user", table_name="support_threads")
    op.drop_index("ix_support_threads_status_created", table_name="support_threads")
    op.drop_table("support_threads")

    # Reverse notifications
    op.drop_index("ix_notifications_user_created", table_name="notifications")
    op.drop_index("ix_notifications_user_read", table_name="notifications")
    op.drop_table("notifications")

    # Reverse applications
    op.drop_index("ix_applications_job_final_score", table_name="applications")
    op.drop_index("ix_applications_job_status", table_name="applications")
    op.drop_index("ix_applications_candidate_created", table_name="applications")
    op.drop_table("applications")

    # Reverse SBERT vectors back to 1536
    if is_postgres:
        op.drop_index("ix_resumes_embedding_hnsw", table_name="resumes", if_exists=True)
        op.drop_index("ix_jobs_embedding_hnsw", table_name="jobs", if_exists=True)
        op.execute("UPDATE jobs SET embedding = NULL")
        op.execute("UPDATE resumes SET embedding = NULL")
        op.alter_column(
            "resumes",
            "embedding",
            type_=Vector(1536),
            existing_type=Vector(384),
            nullable=True,
        )
        op.alter_column(
            "jobs",
            "embedding",
            type_=Vector(1536),
            existing_type=Vector(384),
            nullable=True,
        )
        op.create_index(
            "ix_jobs_embedding_hnsw",
            "jobs",
            ["embedding"],
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        )
        op.create_index(
            "ix_resumes_embedding_hnsw",
            "resumes",
            ["embedding"],
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        )

    # Reverse matches additions
    op.drop_index("ix_matches_job_shortlisted", table_name="matches")
    op.drop_index("ix_matches_resume_score", table_name="matches")
    op.drop_index("ix_matches_job_score", table_name="matches")
    op.drop_constraint("uq_matches_job_resume", "matches", type_="unique")
    op.drop_column("matches", "shortlisted")

    # Reverse resumes additions
    op.drop_index("ix_resumes_candidate_id", table_name="resumes")
    op.drop_constraint("fk_resumes_candidate_id_users", "resumes", type_="foreignkey")
    op.drop_column("resumes", "candidate_id")

    # Reverse jobs additions
    op.drop_index("ix_jobs_recruiter_status", table_name="jobs")
    op.drop_index("ix_jobs_status_created_at", table_name="jobs")
    op.drop_constraint("fk_jobs_recruiter_id_users", "jobs", type_="foreignkey")
    op.drop_column("jobs", "updated_at")
    op.drop_column("jobs", "takedown_reason")
    op.drop_column("jobs", "is_taken_down")
    op.drop_column("jobs", "status")
    op.drop_column("jobs", "job_type")
    op.drop_column("jobs", "experience")
    op.drop_column("jobs", "location")
    op.drop_column("jobs", "extracted_skills")
    op.drop_column("jobs", "required_skills")
    op.drop_column("jobs", "recruiter_id")

    # Reverse recruiter_profiles
    op.drop_table("recruiter_profiles")

    # Reverse users
    op.drop_index("ix_users_role_active", table_name="users")
    op.drop_index("ux_users_email_lower", table_name="users")
    op.drop_table("users")
