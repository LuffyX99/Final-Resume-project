"""Pipeline tests for Dated and Stale Skills Detection."""

from app.services.skill_gap import SkillGapService


def test_pipeline_recency_and_stale_detection():
    service = SkillGapService(current_year=2026)
    resume = "Software Engineer (2017 - 2020):\nImplemented jQuery and AngularJS interfaces."
    gap = service.analyze(
        required_skills=["Angular"],
        candidate_skills=["AngularJS"],
        resume_text=resume,
    )
    assert "Angular" in gap.stale_skills
