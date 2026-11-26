"""Read-only daily health checks for the running API and its dependencies."""

import asyncio
import json
import os
import sys
import time
from urllib.error import URLError
from urllib.request import urlopen

# Allow running from the repository root without installing the API package.
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
API_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "apps", "api"))
if API_DIR not in sys.path:
    sys.path.insert(0, API_DIR)


def check_api_health() -> None:
    url = os.environ.get("API_HEALTH_URL", "http://127.0.0.1:8000/health")
    try:
        with urlopen(url, timeout=5) as response:
            payload = json.loads(response.read())
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"API health endpoint failed ({url}): {exc}") from exc

    if payload.get("status") != "ok":
        raise RuntimeError(f"API health endpoint returned unexpected data: {payload!r}")
    print(f"[1/5] API health endpoint: OK ({url})")


async def check_database() -> None:
    from sqlalchemy import text

    from app.database import engine

    async with engine.connect() as connection:
        result = await connection.execute(text("SELECT 1"))
        if result.scalar_one() != 1:
            raise RuntimeError("Database returned an unexpected health-check result")
    print("[2/5] Configured database connection: OK")


def check_embedding_service() -> None:
    from app.services.sbert import SBERTService

    vector = SBERTService.get_instance()._fallback_embedding("Health check text")
    if len(vector) != 384:
        raise RuntimeError(f"Embedding dimension was {len(vector)}, expected 384")
    print("[3/5] Embedding service fallback: OK (384 dimensions)")


def check_faiss_index() -> None:
    from app.services.faiss_service import FAISSIndexService

    index = FAISSIndexService(dimension=384)
    index.add_vectors(["health-check"], [[0.05] * 384])
    matches = index.search([0.05] * 384, top_k=1)
    if not matches or matches[0]["id"] != "health-check":
        raise RuntimeError("FAISS health-check vector could not be retrieved")
    print("[4/5] FAISS index create/add/search: OK")


def check_scoring_services() -> None:
    from app.services.integrity.scoring import TrustScoringService
    from app.services.skill_gap import SkillGapService

    trust = TrustScoringService().evaluate(
        resume_text="Python and FastAPI engineer",
        job_text="Python Developer",
        similarity_score=0.9,
    )
    if trust.trust_score <= 0 or trust.final_score <= 0:
        raise RuntimeError("Trust scoring returned a non-positive score")

    gap = SkillGapService().analyze(
        required_skills=["Python", "Kubernetes"],
        candidate_skills=["Python"],
        resume_text="Python developer",
        similarity_score=0.85,
    )
    if "Python" not in gap.matched_skills or "Kubernetes" not in gap.missing_skills:
        raise RuntimeError("Skill-gap analysis returned unexpected results")
    print("[5/5] Trust scoring and skill-gap services: OK")


async def run_checks() -> None:
    check_api_health()
    await check_database()
    check_embedding_service()
    check_faiss_index()
    check_scoring_services()


def main() -> int:
    started = time.perf_counter()
    try:
        asyncio.run(run_checks())
    except Exception as exc:
        print(f"Daily health check FAILED: {exc}", file=sys.stderr)
        return 1

    print(f"Daily health check PASSED in {time.perf_counter() - started:.2f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
