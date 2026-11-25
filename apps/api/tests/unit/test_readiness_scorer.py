"""Unit tests for Readiness Scorer and Learning Recommendations."""

from app.services.skill_gap import SkillGapService


class TestReadinessScorer:
    def test_full_match_readiness_score_100(self):
        service = SkillGapService()
        analysis = service.analyze(
            required_skills=["Python", "PostgreSQL"],
            candidate_skills=["Python", "PostgreSQL"],
            resume_text="Python and PostgreSQL developer (2025 - Present).",
        )
        assert analysis.readiness_score == 100
        assert analysis.missing_skills == []
        assert analysis.learning_steps == []

    def test_zero_match_readiness_score_0(self):
        service = SkillGapService()
        analysis = service.analyze(
            required_skills=["Rust", "Go"],
            candidate_skills=["Python"],
            resume_text="Python developer.",
        )
        assert analysis.readiness_score == 0
        assert len(analysis.learning_steps) == 2

    def test_stale_skills_give_partial_credit(self):
        service = SkillGapService()
        # AngularJS provides 50% credit for Angular
        analysis = service.analyze(
            required_skills=["Angular"],
            candidate_skills=["AngularJS"],
            resume_text="Worked on AngularJS in 2019.",
        )
        assert analysis.readiness_score == 50
        assert len(analysis.learning_steps) == 1
        assert analysis.learning_steps[0].status == "stale"
