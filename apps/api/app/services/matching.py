import math
import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Job, Match, Resume
from app.services.embedding import EmbeddingService
from app.services.pii_stripper import PIIStripperService


def cosine_similarity(
    left: list[float] | None,
    right: list[float] | None,
) -> float:
    """Compute a 0..1 cosine similarity without relying on pgvector SQL.

    This is used for the single-application provisional match, which must also
    work against the SQLite test database.
    """
    if not left or not right or len(left) != len(right):
        return 0.0

    dot = 0.0
    left_norm = 0.0
    right_norm = 0.0
    for a, b in zip(left, right):
        af = float(a)
        bf = float(b)
        dot += af * bf
        left_norm += af * af
        right_norm += bf * bf

    if left_norm <= 0 or right_norm <= 0:
        return 0.0

    score = dot / (math.sqrt(left_norm) * math.sqrt(right_norm))
    return max(0.0, min(1.0, score))


class MatchingService:
    def __init__(self, session: AsyncSession, top_n: int = 10):
        self.session = session
        self.top_n = top_n

    async def score_application(
        self, job: Job, resume: Resume
    ) -> Match | None:
        """Create the single job/resume match for a freshly submitted application."""
        if job.embedding is None or resume.embedding is None:
            return None

        similarity = cosine_similarity(
            list(job.embedding), list(resume.embedding)
        )
        match = Match(
            job_id=job.id,
            resume_id=resume.id,
            similarity_score=similarity,
            bias_reduced=False,
            shortlisted=False,
        )
        self.session.add(match)
        await self.session.flush()
        return match

    async def compute_matches(
        self, job_id: uuid.UUID, bias_reduced: bool = False
    ) -> list[Match]:
        """Find top-N most similar resumes for a given job and persist results."""
        job = await self.session.get(Job, job_id)
        if job is None:
            raise ValueError(f"Job {job_id} not found")
        if job.embedding is None:
            raise ValueError(f"Job {job_id} has no embedding")

        # For bias-reduced mode, re-embed the job text with PII stripped
        if bias_reduced:
            pii_service = PIIStripperService()
            embedding_service = EmbeddingService()
            stripped = await pii_service.strip_pii(
                f"{job.title} at {job.company}\n\n{job.description}"
            )
            query_embedding = await embedding_service.get_embedding(stripped)
        else:
            query_embedding = job.embedding

        # Query pgvector for most similar resumes using cosine distance
        stmt = (
            select(
                Resume.id,
                Resume.embedding.cosine_distance(query_embedding).label(
                    "distance"
                ),
            )
            .where(Resume.embedding.isnot(None))
            .order_by("distance")
            .limit(self.top_n)
        )
        rows = (await self.session.execute(stmt)).all()

        # Remove existing matches for this job before inserting new ones
        await self.session.execute(
            delete(Match).where(Match.job_id == job_id)
        )

        matches: list[Match] = []
        for resume_id, distance in rows:
            similarity = max(0.0, min(1.0, 1.0 - float(distance)))
            match = Match(
                job_id=job_id,
                resume_id=resume_id,
                similarity_score=similarity,
                bias_reduced=bias_reduced,
                shortlisted=False,
            )
            self.session.add(match)
            matches.append(match)

        await self.session.flush()
        return matches

    async def compute_matches_for_resume(
        self, resume_id: uuid.UUID, bias_reduced: bool = False
    ) -> list[Match]:
        """Find top-N most similar jobs for a given resume and persist results."""
        resume = await self.session.get(Resume, resume_id)
        if resume is None:
            raise ValueError(f"Resume {resume_id} not found")
        if resume.embedding is None:
            raise ValueError(f"Resume {resume_id} has no embedding")

        # For bias-reduced mode, re-embed the resume text with PII stripped
        if bias_reduced:
            pii_service = PIIStripperService()
            embedding_service = EmbeddingService()
            stripped = await pii_service.strip_pii(resume.content)
            query_embedding = await embedding_service.get_embedding(stripped)
        else:
            query_embedding = resume.embedding

        # Query pgvector for most similar jobs using cosine distance
        stmt = (
            select(
                Job.id,
                Job.embedding.cosine_distance(query_embedding).label(
                    "distance"
                ),
            )
            .where(Job.embedding.isnot(None))
            .order_by("distance")
            .limit(self.top_n)
        )
        rows = (await self.session.execute(stmt)).all()

        # Remove existing matches for this resume before inserting new ones
        await self.session.execute(
            delete(Match).where(Match.resume_id == resume_id)
        )

        matches: list[Match] = []
        for job_id, distance in rows:
            similarity = max(0.0, min(1.0, 1.0 - float(distance)))
            match = Match(
                job_id=job_id,
                resume_id=resume_id,
                similarity_score=similarity,
                bias_reduced=bias_reduced,
                shortlisted=False,
            )
            self.session.add(match)
            matches.append(match)

        await self.session.flush()
        return matches
