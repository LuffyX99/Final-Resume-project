"""Security tests for File Upload Validation."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_unsupported_file_type_rejected(client: AsyncClient, candidate_headers: dict[str, str]):
    files = {"file": ("malicious.exe", b"MZ\x90\x00\x03\x00\x00\x00", "application/octet-stream")}
    data = {"candidate_name": "Attacker"}
    res = await client.post("/api/resumes/upload", data=data, files=files, headers=candidate_headers)
    assert res.status_code == 400
