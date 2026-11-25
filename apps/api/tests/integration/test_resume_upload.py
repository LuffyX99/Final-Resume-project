"""Integration tests for Resume Upload endpoint."""

import io
import pytest
from httpx import AsyncClient


def make_pdf_bytes(text: str) -> bytes:
    import pymupdf
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((50, 50), text)
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


@pytest.mark.asyncio
async def test_resume_upload_pdf(client: AsyncClient, candidate_headers: dict[str, str]):
    pdf_bytes = make_pdf_bytes("Alice Smith\nPython and FastAPI Engineer.")
    files = {"file": ("alice_resume.pdf", pdf_bytes, "application/pdf")}
    data = {"candidate_name": "Alice Smith"}

    response = await client.post("/api/resumes/upload", data=data, files=files, headers=candidate_headers)
    assert response.status_code == 201
    res = response.json()
    assert res["candidate_name"] == "Test Person"
    assert "id" in res
    assert "Python" in res.get("skills", []) or "FastAPI" in res.get("skills", [])
