"""Performance benchmark for Full Pipeline scoring latency."""

import time
from app.services.integrity.scoring import TrustScoringService
from app.services.skill_gap import SkillGapService


def test_full_pipeline_scoring_latency_meets_sla():
    trust_service = TrustScoringService()
    gap_service = SkillGapService()

    start = time.perf_counter()
    eval_res = trust_service.evaluate(
        resume_text="Senior Python and FastAPI Developer with Docker experience.",
        job_text="Backend Engineer with Python, FastAPI, Docker, and PostgreSQL.",
        similarity_score=0.88,
    )
    final_score = trust_service.compute_final_score(0.88, eval_res.trust_score)
    gap_res = gap_service.analyze(
        required_skills=["Python", "FastAPI", "Docker", "PostgreSQL"],
        candidate_skills=["Python", "FastAPI", "Docker"],
        resume_text="Senior Python and FastAPI Developer with Docker experience.",
        similarity_score=0.88,
    )
    duration = time.perf_counter() - start

    # SLA: < 5.0s per resume
    assert duration < 5.0, f"Full pipeline latency was {duration:.3f}s, exceeding 5s SLA"
    assert final_score > 0
    assert gap_res.readiness_score > 0
