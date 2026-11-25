import asyncio
import os
from dataclasses import dataclass

from fastapi import UploadFile

from app.config import settings
from app.services.file_parser import parse_file

ALLOWED_EXTENSIONS = {"pdf", "docx"}
MAX_FILENAME_LENGTH = 255

_PDF_MAGIC = b"%PDF"
_DOCX_MAGIC = b"PK\x03\x04"


class ResumeUploadError(ValueError):
    """A client-facing upload validation failure."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class ResumeUpload:
    content: str
    filename: str
    size: int
    raw_bytes: bytes = b""


async def read_resume_upload(file: UploadFile) -> ResumeUpload:
    """Read, validate, and extract text from a PDF/DOCX upload.

    Validation is authoritative on the server: extension, magic bytes, byte
    size, and parseable text are all checked before the application transaction
    writes anything.
    """
    raw_name = (file.filename or "").strip()
    filename = os.path.basename(raw_name)
    if not filename:
        raise ResumeUploadError("A resume file is required.")

    if len(filename) > MAX_FILENAME_LENGTH:
        raise ResumeUploadError("The resume file name is too long.")

    extension = (
        filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    )
    if extension not in ALLOWED_EXTENSIONS:
        raise ResumeUploadError("Only PDF and DOCX resumes are supported.")

    max_bytes = settings.max_resume_bytes
    data = await file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise ResumeUploadError(
            f"Resume must be {max_bytes // (1024 * 1024)} MB or smaller.",
            status_code=413,
        )
    if not data:
        raise ResumeUploadError("The uploaded resume is empty.")

    if extension == "pdf" and not data.startswith(_PDF_MAGIC):
        raise ResumeUploadError("The uploaded file is not a valid PDF.")
    if extension == "docx" and not data.startswith(_DOCX_MAGIC):
        raise ResumeUploadError("The uploaded file is not a valid DOCX.")

    try:
        content = await asyncio.to_thread(parse_file, data, filename)
    except Exception as exc:
        raise ResumeUploadError(
            "Could not read the resume. Upload a valid PDF or DOCX."
        ) from exc

    if not content.strip():
        raise ResumeUploadError("Could not extract text from the resume.")

    return ResumeUpload(
        content=content,
        filename=filename,
        size=len(data),
        raw_bytes=data,
    )
