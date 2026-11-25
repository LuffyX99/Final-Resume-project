"""Unit tests for Skill Extraction and Normalization."""

import pytest
from app.services.skill_extraction import SkillExtractionService, SKILL_ALIASES
from app.services.skill_gap import normalize_skill


class TestSkillExtractor:
    def test_alias_normalization(self):
        assert normalize_skill("js") == "JavaScript"
        assert normalize_skill("k8s") == "Kubernetes"
        assert normalize_skill("postgres") == "PostgreSQL"
        assert normalize_skill("ts") == "TypeScript"
        assert normalize_skill("golang") == "Golang"

    @pytest.mark.asyncio
    async def test_regex_fallback_skill_extraction(self):
        service = SkillExtractionService()
        sample_text = (
            "Experienced with Python, FastAPI, Docker, and PostgreSQL. "
            "Built CI/CD pipelines with GitHub Actions."
        )
        skills = await service.extract_skills(sample_text)
        assert "Python" in skills
        assert "FastAPI" in skills
        assert "Docker" in skills
        assert "PostgreSQL" in skills
