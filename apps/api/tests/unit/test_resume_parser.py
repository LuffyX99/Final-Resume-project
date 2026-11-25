"""Unit tests for Resume Parser (PyMuPDF and python-docx)."""

import io
import pytest
from docx import Document

from app.services.file_parser import parse_docx, parse_file, parse_pdf


def make_sample_docx(paragraphs: list[str], table_rows: list[list[str]] | None = None) -> bytes:
    doc = Document()
    for p in paragraphs:
        doc.add_paragraph(p)
    if table_rows:
        table = doc.add_table(rows=len(table_rows), cols=len(table_rows[0]))
        for i, row in enumerate(table_rows):
            for j, val in enumerate(row):
                table.cell(i, j).text = val
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def make_sample_pdf(text: str) -> bytes:
    import pymupdf

    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((50, 50), text)
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


class TestResumeParser:
    def test_parse_pdf_extracts_text(self):
        sample_text = "John Doe\nPython and FastAPI Engineer"
        pdf_bytes = make_sample_pdf(sample_text)
        extracted = parse_pdf(pdf_bytes)
        assert "John Doe" in extracted
        assert "FastAPI" in extracted

    def test_parse_docx_extracts_paragraphs_and_tables(self):
        docx_bytes = make_sample_docx(
            ["Alice Smith", "Senior Cloud Architect"],
            table_rows=[["Skill", "Years"], ["AWS", "5"], ["Kubernetes", "3"]],
        )
        extracted = parse_docx(docx_bytes)
        assert "Alice Smith" in extracted
        assert "Senior Cloud Architect" in extracted
        assert "AWS" in extracted
        assert "Kubernetes" in extracted

    def test_parse_file_dispatcher(self):
        pdf_bytes = make_sample_pdf("Resume content in PDF")
        res_pdf = parse_file(pdf_bytes, "resume.pdf")
        assert "Resume content in PDF" in res_pdf

        docx_bytes = make_sample_docx(["Resume content in DOCX"])
        res_docx = parse_file(docx_bytes, "candidate.docx")
        assert "Resume content in DOCX" in res_docx

    def test_unsupported_file_extension_raises_error(self):
        with pytest.raises(ValueError, match="Unsupported file type"):
            parse_file(b"dummy data", "resume.txt")
