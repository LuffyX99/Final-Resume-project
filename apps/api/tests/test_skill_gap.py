import pytest

from app.config import settings
from app.services.skill_gap import LearningStep, SkillGapAnalysis, SkillGapService


class TestSkillGapService:
    @pytest.fixture
    def service(self) -> SkillGapService:
        return SkillGapService(current_year=2026)

    def test_alias_normalization(self, service: SkillGapService):
        """Aliases like 'JS', 'k8s', 'postgres' are normalized to canonical skill names."""
        resume_text = (
            "Senior Developer experienced in JS, k8s, and postgres.\n\n"
            "2024 - Present: Building scalable microservices."
        )
        required = ["JavaScript", "Kubernetes", "PostgreSQL"]

        analysis = service.analyze(
            required_skills=required,
            candidate_skills=["JS", "k8s", "postgres"],
            resume_text=resume_text,
        )

        assert set(analysis.matched_skills) == {"JavaScript", "Kubernetes", "PostgreSQL"}
        assert analysis.missing_skills == []
        assert analysis.stale_skills == []
        assert analysis.readiness_score == 100

    def test_skill_classification_matched_missing_stale(self, service: SkillGapService):
        """Skills are classified into matched (recent), missing (absent), and stale (old)."""
        resume_text = (
            "Lead Software Engineer\n\n"
            "Company A (2024 - Present):\n"
            "Developing cloud backend services with Python, FastAPI, and Docker.\n\n"
            "Company B (2015 - 2019):\n"
            "Managed relational databases with Oracle and built legacy services with Ruby on Rails."
        )
        required = ["Python", "Docker", "Ruby on Rails", "Kubernetes"]

        analysis = service.analyze(
            required_skills=required,
            candidate_skills=["Python", "Docker", "Ruby on Rails"],
            resume_text=resume_text,
        )

        # Python and Docker are recent (2024 - Present)
        assert "Python" in analysis.matched_skills
        assert "Docker" in analysis.matched_skills

        # Ruby on Rails was only used 2015 - 2019 (> 3 years before 2026)
        assert "Ruby on Rails" in analysis.stale_skills

        # Kubernetes was never mentioned
        assert "Kubernetes" in analysis.missing_skills

    def test_legacy_technology_classified_as_stale(self, service: SkillGapService):
        """Superseded or legacy technologies (e.g. AngularJS) are classified as stale."""
        resume_text = (
            "Frontend Engineer (2024 - Present):\n"
            "Maintained client web interfaces built with AngularJS."
        )
        required = ["Angular"]

        analysis = service.analyze(
            required_skills=required,
            candidate_skills=["AngularJS"],
            resume_text=resume_text,
        )

        assert "Angular" in analysis.stale_skills
        assert analysis.matched_skills == []

    def test_readiness_score_weighting_and_staleness_penalty(self, service: SkillGapService):
        """Readiness score factors in critical skill weighting (2x) and staleness credit (50%)."""
        # Critical skills: Python (weight 2.0, matched = 2.0 credit)
        # Extracted skills: Docker (weight 1.0, stale = 0.5 credit), Kafka (weight 1.0, missing = 0.0 credit)
        # Total weight = 2.0 + 1.0 + 1.0 = 4.0
        # Total credit = 2.0 + 0.5 + 0.0 = 2.5
        # Readiness score = round(2.5 / 4.0 * 100) = 63%
        resume_text = (
            "Software Engineer\n\n"
            "Current Role (2025 - Present):\n"
            "Writing high-throughput Python services.\n\n"
            "Old Role (2016 - 2020):\n"
            "Containerized legacy tools using Docker."
        )

        analysis = service.analyze(
            required_skills=["Python"],
            extracted_skills=["Docker", "Kafka"],
            candidate_skills=["Python", "Docker"],
            resume_text=resume_text,
        )

        assert "Python" in analysis.matched_skills
        assert "Docker" in analysis.stale_skills
        assert "Kafka" in analysis.missing_skills
        assert analysis.readiness_score == 63

    def test_learning_step_generation(self, service: SkillGapService):
        """Concrete, actionable learning steps are generated for missing and stale skills."""
        resume_text = (
            "Experience:\n\n"
            "2017 - 2020: Deployed containerized applications with Kubernetes."
        )
        required = ["Kubernetes", "AWS"]

        analysis = service.analyze(
            required_skills=required,
            candidate_skills=["Kubernetes"],
            resume_text=resume_text,
        )

        assert len(analysis.learning_steps) == 2
        steps_by_skill = {s.skill: s for s in analysis.learning_steps}

        # Kubernetes is stale
        k8s_step = steps_by_skill["Kubernetes"]
        assert k8s_step.status == "stale"
        assert "Kubernetes" in k8s_step.title
        assert len(k8s_step.action) > 20
        assert "time" in k8s_step.estimated_time or "week" in k8s_step.estimated_time

        # AWS is missing
        aws_step = steps_by_skill["AWS"]
        assert aws_step.status == "missing"
        assert "AWS" in aws_step.title
        assert "Amazon Web Services" in aws_step.title or "AWS" in aws_step.title

    def test_zero_required_skills_falls_back_to_similarity(self, service: SkillGapService):
        """When a job specifies no skills, readiness score defaults to semantic similarity * 100."""
        analysis = service.analyze(
            required_skills=[],
            extracted_skills=[],
            candidate_skills=["Python"],
            resume_text="Some resume",
            similarity_score=0.82,
        )
        assert analysis.readiness_score == 82
        assert analysis.learning_steps == []
