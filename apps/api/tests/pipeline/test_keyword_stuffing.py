"""Pipeline tests for Keyword Stuffing Detection."""

from app.services.integrity.keyword_stuffing import KeywordStuffingDetector


def test_pipeline_keyword_stuffing_detection():
    detector = KeywordStuffingDetector()
    text = "Fullstack developer.\n\n" + "React Node Python AWS " * 20
    flags = detector.inspect(text)
    assert len(flags) > 0
    assert any("REPETITION" in f.code or "DENSITY" in f.code for f in flags)
