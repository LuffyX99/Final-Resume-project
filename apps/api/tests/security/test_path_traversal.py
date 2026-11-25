"""Security tests for Path Traversal Prevention."""

import pytest
from httpx import AsyncClient
from tests.integration.test_resume_upload import make_pdf_bytes


@pytest.mark.asyncio
async def test_path_traversal_filename_sanitized(client: AsyncClient, candidate_headers: dict[str, str]):
    pdf_bytes = make_pdf_bytes("Clean resume.")
    # Attempt directory traversal in filename
    files = {"file": ("../../../../etc/passwd.pdf", pdf_bytes, "application/pdf")}
    data = {"candidate_name": "Traversal Test"}
    res = await client.post("/api/resumes/upload", data=data, files=files, headers=candidate_headers)
    assert res.status_code == 201
    # File is safely stored by basename
    stored_name = res.json()["file_name"]
    assert ".." not in stored_name
