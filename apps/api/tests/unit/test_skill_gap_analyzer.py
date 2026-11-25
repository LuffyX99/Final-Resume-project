"""Unit tests for Skill Gap and Recency Analysis."""

from app.services.skill_gap import SkillGapService, normalize_skill


class TestSkillGapAnalyzer:
    def test_matched_and_missing_skills_classification(self):
        service = SkillGapService()
        analysis = service.analyze(
            required_skills=["Python", "FastAPI", "Kubernetes"],
            candidate_skills=["Python", "FastAPI"],
            resume_text="Senior Python and FastAPI backend developer (2024 - Present).",
        )
        assert "Python" in analysis.matched_skills
        assert "FastAPI" in analysis.matched_skills
        assert "Kubernetes" in analysis.missing_skills
        assert analysis.stale_skills == []

    def test_stale_technology_detection(self):
        service = SkillGapService()
        # AngularJS is in LEGACY_SKILL_MAP as legacy variant of Angular
        analysis = service.analyze(
            required_skills=["Angular"],
            candidate_skills=["AngularJS"],
            resume_text="Front-end developer working with AngularJS (2018 - 2020).",
        )
        assert "Angular" in analysis.stale_skills
        assert "Angular" not in analysis.missing_skills

    def test_temporal_staleness_by_year_cutoff(self):
        service = SkillGapService(current_year=2026)
        # Kubernetes used exclusively 2018-2021 (> 3 years threshold)
        analysis = service.analyze(
            required_skills=["Kubernetes"],
            candidate_skills=["Kubernetes"],
            resume_text="Cloud Engineer (2018 - 2021):\nMaintained Kubernetes clusters.",
        )
        assert "Kubernetes" in analysis.stale_skills
