"""Unit tests for Trust Scorer Engine (Hidden Text and Keyword Stuffing)."""

import io
import pytest
from app.services.integrity.hidden_text import HiddenTextDetector
from app.services.integrity.keyword_stuffing import KeywordStuffingDetector
from app.services.integrity.scoring import TrustScoringService


def make_pdf_with_white_text() -> bytes:
    import pymupdf
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((50, 50), "Adversarial Hidden Text", color=(1.0, 1.0, 1.0))
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


class TestTrustScorer:
    def test_hidden_white_text_inspection(self):
        detector = HiddenTextDetector()
        pdf_bytes = make_pdf_with_white_text()
        flags = detector.inspect(pdf_bytes, "resume.pdf")
        assert len(flags) > 0
        assert any(f.code == "WHITE_TEXT_DETECTED" for f in flags)

    def test_keyword_stuffing_detection(self):
        detector = KeywordStuffingDetector()
        stuffed_text = "Python engineer. " + "Python " * 25
        flags = detector.inspect(stuffed_text)
        assert len(flags) > 0
        assert any(f.code == "EXCESSIVE_KEYWORD_REPETITION" for f in flags)

    def test_fraudulent_candidate_disqualified_to_zero(self):
        scorer = TrustScoringService()
        pdf_bytes = make_pdf_with_white_text()
        result = scorer.evaluate(
            file_bytes=pdf_bytes,
            filename="cheater.pdf",
            resume_text="Python " * 30,
            job_text="Python Developer",
            similarity_score=0.95,
        )
        assert result.trust_score < 0.30
        assert result.final_score == 0.0
        assert result.is_shortlisted is False
