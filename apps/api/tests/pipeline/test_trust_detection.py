"""Pipeline tests for Trust and Hidden Text Detection."""

import io
from app.services.integrity.hidden_text import HiddenTextDetector


def test_pipeline_hidden_text_detection():
    detector = HiddenTextDetector()
    import pymupdf
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((100, 100), "Hidden keywords", color=(0.98, 0.98, 0.98))
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()

    flags = detector.inspect(buf.getvalue(), "resume.pdf")
    assert len(flags) > 0
    assert any(f.code == "WHITE_TEXT_DETECTED" for f in flags)
