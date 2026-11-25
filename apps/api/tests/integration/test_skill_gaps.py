"""Integration tests for Skill Gaps endpoint payload in applications."""

import io
import pytest
from httpx import AsyncClient
from tests.integration.test_resume_upload import make_pdf_bytes


@pytest.mark.asyncio
async def test_application_skill_gap_analysis_payload(client: AsyncClient, candidate_headers: dict[str, str], recruiter_headers: dict[str, str]):
    # Create Job
    job_res = await client.post(
        "/api/jobs",
        json={"title": "DevOps Engineer", "company": "CloudCorp", "description": "K8s and Docker", "required_skills": ["Kubernetes", "Docker", "Terraform"]},
        headers=recruiter_headers,
    )
    job_id = job_res.json()["id"]

    # Submit Application
    pdf_bytes = make_pdf_bytes("DevOps Specialist with Docker experience (2024 - Present).")
    files = {"file": ("resume.pdf", pdf_bytes, "application/pdf")}
    data = {
        "job_id": job_id,
        "full_name": "Bob Tester",
        "phone_number": "+919876543210",
        "age": "28",
        "gender": "male",
    }
    app_res = await client.post("/api/applications", data=data, files=files, headers=candidate_headers)
    assert app_res.status_code == 201
    app_data = app_res.json()
    assert "skill_gap_analysis" in app_data
    assert "readiness_score" in app_data
    gap = app_data["skill_gap_analysis"]
    assert "matched_skills" in gap
    assert "missing_skills" in gap
