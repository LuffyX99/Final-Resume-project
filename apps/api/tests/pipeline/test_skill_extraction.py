"""Pipeline tests for Skill Extraction."""

import pytest
from app.services.skill_extraction import SkillExtractionService


@pytest.mark.asyncio
async def test_pipeline_skill_extraction():
    service = SkillExtractionService()
    text = "Specializing in React, TypeScript, Docker, and PostgreSQL databases."
    skills = await service.extract_skills(text)
    assert "React" in skills or "react" in [s.lower() for s in skills]
    assert "Docker" in skills or "docker" in [s.lower() for s in skills]
