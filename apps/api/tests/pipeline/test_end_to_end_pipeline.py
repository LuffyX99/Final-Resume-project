"""Pipeline tests for End-to-End Matching & Scoring Pipeline."""

import pytest
from app.services.integrity.scoring import TrustScoringService
from app.services.skill_gap import SkillGapService


def test_end_to_end_scoring_pipeline():
    trust_service = TrustScoringService()
    gap_service = SkillGapService()

    # 1. Similarity
    similarity = 0.85

    # 2. Trust evaluation (Clean candidate)
    eval_res = trust_service.evaluate(
        resume_text="Senior Python and FastAPI Developer with 5 years experience.",
        job_text="Backend Developer with Python, FastAPI, and Docker experience.",
        similarity_score=similarity,
    )
    assert eval_res.trust_score == 1.0

    # 3. Final score (multiplicative mode: sim * trust)
    final_score = trust_service.compute_final_score(
        similarity_score=similarity,
        trust_score=eval_res.trust_score,
        mode="multiplicative",
    )
    assert final_score == pytest.approx(0.85, abs=1e-4)

    # 4. Readiness & Gaps
    gap_res = gap_service.analyze(
        required_skills=["Python", "FastAPI", "Docker"],
        candidate_skills=["Python", "FastAPI"],
        resume_text="Senior Python and FastAPI Developer.",
        similarity_score=similarity,
    )
    assert "Python" in gap_res.matched_skills
    assert "Docker" in gap_res.missing_skills
    assert gap_res.readiness_score > 0
    assert len(gap_res.learning_steps) >= 1
