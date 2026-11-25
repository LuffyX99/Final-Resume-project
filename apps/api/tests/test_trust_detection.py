import io
import docx
from docx.oxml import OxmlElement
from docx.shared import Pt, RGBColor
import pymupdf
import pytest

from app.config import settings
from app.services.integrity.hidden_text import HiddenTextDetector
from app.services.integrity.keyword_stuffing import KeywordStuffingDetector
from app.services.integrity.models import FlagSeverity
from app.services.integrity.scoring import TrustScoringService


# =============================================================================
# Helper utilities to synthesize realistic clean and adversarial resumes
# =============================================================================

def make_clean_pdf() -> bytes:
    """Generate a clean, professional candidate resume in PDF format."""
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    # Header
    page.insert_text(pymupdf.Point(50, 70), "Alex Johnson", fontsize=18, color=(0.1, 0.1, 0.1))
    page.insert_text(pymupdf.Point(50, 95), "Staff Software Engineer | alex.j@example.com | (555) 019-2834", fontsize=10, color=(0.2, 0.2, 0.2))

    # Experience section
    page.insert_text(pymupdf.Point(50, 140), "Work Experience", fontsize=14, color=(0.1, 0.1, 0.1))
    page.insert_text(pymupdf.Point(50, 165), "Lead Backend Architect - CloudScale Systems (2020 - Present)", fontsize=11, color=(0.15, 0.15, 0.15))
    page.insert_text(
        pymupdf.Point(50, 185),
        "Architected scalable microservices handling 25M daily requests using Python and FastAPI.",
        fontsize=10,
        color=(0.2, 0.2, 0.2),
    )
    page.insert_text(
        pymupdf.Point(50, 205),
        "Reduced database query p99 latency by 45% through PostgreSQL indexing and Redis caching.",
        fontsize=10,
        color=(0.2, 0.2, 0.2),
    )
    page.insert_text(
        pymupdf.Point(50, 225),
        "Mentored a team of 8 engineers and introduced automated end-to-end integration testing.",
        fontsize=10,
        color=(0.2, 0.2, 0.2),
    )

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def make_white_text_pdf() -> bytes:
    """Adversarial PDF containing hidden white font text."""
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text(pymupdf.Point(50, 70), "Alex Johnson", fontsize=14, color=(0, 0, 0))
    page.insert_text(pymupdf.Point(50, 95), "Normal visible resume content here.", fontsize=10, color=(0, 0, 0))

    # Injected hidden white text (RGB = 1.0, 1.0, 1.0 -> #FFFFFF)
    page.insert_text(
        pymupdf.Point(50, 150),
        "Python FastAPI Docker Kubernetes AWS PostgreSQL Redis Kafka GraphQL",
        fontsize=11,
        color=(1.0, 1.0, 1.0),
    )
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def make_tiny_font_pdf() -> bytes:
    """Adversarial PDF containing hidden 1.0pt font text."""
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text(pymupdf.Point(50, 70), "Candidate Name", fontsize=12, color=(0, 0, 0))
    page.insert_text(pymupdf.Point(50, 100), "Standard visible career summary.", fontsize=10, color=(0, 0, 0))

    # Imperceptible tiny text
    page.insert_text(
        pymupdf.Point(50, 180),
        "Hidden tiny keywords: Machine Learning Deep Learning Neural Networks PyTorch",
        fontsize=1.2,
        color=(0, 0, 0),
    )
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def make_off_page_pdf() -> bytes:
    """Adversarial PDF containing text rendered beyond the visible canvas."""
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text(pymupdf.Point(50, 70), "Candidate Name", fontsize=12, color=(0, 0, 0))

    # Placed outside visible page (x=700, y=1100 on 595x842 page)
    page.insert_text(
        pymupdf.Point(700, 1100),
        "Off-page keyword injection block: Kubernetes Go Rust AWS",
        fontsize=10,
        color=(0, 0, 0),
    )
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def make_clean_docx() -> bytes:
    """Generate a clean, standard candidate resume in DOCX format."""
    doc = docx.Document()
    doc.add_heading("Taylor Morgan", level=1)
    doc.add_paragraph("Senior Full-Stack Engineer | taylor@example.com")
    doc.add_heading("Professional Experience", level=2)
    p = doc.add_paragraph()
    p.add_run(
        "Built responsive client portals using React, TypeScript, and Tailwind CSS. "
        "Collaborated closely with product designers to implement accessible UX components."
    )
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def make_hidden_vanish_docx() -> bytes:
    """Adversarial DOCX containing a paragraph with w:vanish XML attribute."""
    doc = docx.Document()
    doc.add_heading("Adversarial Applicant", level=1)
    doc.add_paragraph("Visible summary of background.")

    p = doc.add_paragraph()
    r = p.add_run("Hidden keyword text: Python Docker Kubernetes CI/CD PostgreSQL")
    rPr = r._r.get_or_add_rPr()
    rPr.append(OxmlElement("w:vanish"))

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def make_white_font_docx() -> bytes:
    """Adversarial DOCX containing white text run (#FFFFFF)."""
    doc = docx.Document()
    doc.add_heading("Adversarial Applicant", level=1)
    p = doc.add_paragraph()
    r = p.add_run("White font injected skills: PyTorch TensorFlow Pandas NumPy")
    r.font.color.rgb = RGBColor(255, 255, 255)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


# =============================================================================
# Test Suite: Hidden Text Detection
# =============================================================================

class TestHiddenTextDetector:
    @pytest.fixture
    def detector(self) -> HiddenTextDetector:
        return HiddenTextDetector()

    def test_clean_pdf_has_zero_flags(self, detector: HiddenTextDetector):
        clean_pdf = make_clean_pdf()
        flags = detector.inspect(clean_pdf, "resume.pdf")
        assert flags == [], f"Expected 0 flags for clean PDF, got {flags}"

    def test_white_text_pdf_detected(self, detector: HiddenTextDetector):
        bad_pdf = make_white_text_pdf()
        flags = detector.inspect(bad_pdf, "resume.pdf")
        codes = [f.code for f in flags]
        assert "WHITE_TEXT_DETECTED" in codes

        flag = next(f for f in flags if f.code == "WHITE_TEXT_DETECTED")
        assert flag.severity == FlagSeverity.CRITICAL
        assert flag.penalty == 0.60
        assert "hidden text span" in flag.reason.lower()

    def test_tiny_font_pdf_detected(self, detector: HiddenTextDetector):
        bad_pdf = make_tiny_font_pdf()
        flags = detector.inspect(bad_pdf, "resume.pdf")
        codes = [f.code for f in flags]
        assert "TINY_FONT_TEXT" in codes

        flag = next(f for f in flags if f.code == "TINY_FONT_TEXT")
        assert flag.severity == FlagSeverity.HIGH
        assert flag.penalty == 0.35

    def test_off_page_pdf_detected(self, detector: HiddenTextDetector):
        bad_pdf = make_off_page_pdf()
        flags = detector.inspect(bad_pdf, "resume.pdf")
        codes = [f.code for f in flags]
        assert "OFF_PAGE_TEXT" in codes

        flag = next(f for f in flags if f.code == "OFF_PAGE_TEXT")
        assert flag.severity == FlagSeverity.HIGH

    def test_clean_docx_has_zero_flags(self, detector: HiddenTextDetector):
        clean_docx = make_clean_docx()
        flags = detector.inspect(clean_docx, "resume.docx")
        assert flags == [], f"Expected 0 flags for clean DOCX, got {flags}"

    def test_hidden_vanish_docx_detected(self, detector: HiddenTextDetector):
        bad_docx = make_hidden_vanish_docx()
        flags = detector.inspect(bad_docx, "resume.docx")
        codes = [f.code for f in flags]
        assert "HIDDEN_RUN_PROPERTY" in codes

        flag = next(f for f in flags if f.code == "HIDDEN_RUN_PROPERTY")
        assert flag.severity == FlagSeverity.CRITICAL
        assert flag.penalty == 0.60

    def test_white_font_docx_detected(self, detector: HiddenTextDetector):
        bad_docx = make_white_font_docx()
        flags = detector.inspect(bad_docx, "resume.docx")
        codes = [f.code for f in flags]
        assert "WHITE_TEXT_DETECTED" in codes

        flag = next(f for f in flags if f.code == "WHITE_TEXT_DETECTED")
        assert flag.severity == FlagSeverity.CRITICAL


# =============================================================================
# Test Suite: Keyword Stuffing & Content Integrity
# =============================================================================

class TestKeywordStuffingDetector:
    @pytest.fixture
    def detector(self) -> KeywordStuffingDetector:
        return KeywordStuffingDetector()

    def test_clean_resume_text_has_zero_flags(self, detector: KeywordStuffingDetector):
        clean_text = (
            "Senior Backend Engineer with 7 years of professional software development experience. "
            "Led engineering initiatives building scalable RESTful web APIs and asynchronous job workers. "
            "Architected Postgres database schemas, optimized query plans, and containerized deployment pipelines."
        )
        flags = detector.inspect(clean_text)
        assert flags == []

    def test_abnormal_keyword_repetition_detected(self, detector: KeywordStuffingDetector):
        stuffed_text = (
            "Professional software engineer. "
            + " ".join(["Python is great. I write Python daily. Python Python Python."] * 6)
        )
        flags = detector.inspect(stuffed_text)
        codes = [f.code for f in flags]
        assert "EXCESSIVE_KEYWORD_REPETITION" in codes

        flag = next(f for f in flags if f.code == "EXCESSIVE_KEYWORD_REPETITION")
        assert flag.severity == FlagSeverity.MEDIUM
        assert "repeats" in flag.reason.lower()

    def test_abnormal_skill_density_detected(self, detector: KeywordStuffingDetector):
        dense_skill_list = (
            "Candidate Profile.\n"
            "Skills: Python, Java, C++, C#, Ruby, PHP, Rust, Go, JavaScript, TypeScript, "
            "React, Angular, Vue, Svelte, HTML5, CSS3, Tailwind, Bootstrap, Node, Express, "
            "FastAPI, Django, Flask, Spring, ASP.NET, Postgres, MySQL, MongoDB, Redis, Kafka\n"
            "Short summary sentence here."
        )
        flags = detector.inspect(dense_skill_list)
        codes = [f.code for f in flags]
        assert "ABNORMAL_SKILL_DENSITY" in codes

        flag = next(f for f in flags if f.code == "ABNORMAL_SKILL_DENSITY")
        assert flag.severity == FlagSeverity.MEDIUM
        assert "consecutive tags" in flag.reason.lower()

    def test_job_description_injection_detected(self, detector: KeywordStuffingDetector):
        job_description = (
            "We are seeking an experienced site reliability engineer to maintain 99.99% availability "
            "across multi-region cloud infrastructure and automate incident response runbooks."
        )
        resume_with_injection = (
            "Experienced professional with track record in cloud engineering.\n\n"
            "Core background: We are seeking an experienced site reliability engineer to maintain "
            "99.99% availability across multi-region cloud infrastructure and automate incident response runbooks.\n"
            "Led production triage and post-mortems."
        )
        flags = detector.inspect(resume_with_injection, job_text=job_description)
        codes = [f.code for f in flags]
        assert "JOB_DESCRIPTION_INJECTION" in codes

        flag = next(f for f in flags if f.code == "JOB_DESCRIPTION_INJECTION")
        assert flag.severity == FlagSeverity.CRITICAL
        assert flag.penalty == 0.50
        assert "verbatim job description" in flag.reason.lower()


# =============================================================================
# Test Suite: Trust Scoring & Defensible Ranking Formula
# =============================================================================

class TestTrustScoringService:
    @pytest.fixture
    def service(self) -> TrustScoringService:
        return TrustScoringService()

    def test_clean_candidate_scores_full_trust(self, service: TrustScoringService):
        pdf_bytes = make_clean_pdf()
        resume_text = (
            "Staff Software Engineer with expertise in distributed systems, FastAPI, and Postgres. "
            "Designed reliable streaming architectures handling millions of daily records."
        )
        job_text = "Senior Backend Engineer building distributed applications in Python."

        result = service.evaluate(
            file_bytes=pdf_bytes,
            filename="alex_resume.pdf",
            resume_text=resume_text,
            job_text=job_text,
            similarity_score=0.88,
        )

        assert result.trust_score == 1.0
        assert result.flags == []
        assert result.similarity_score == 0.88
        # Final = 0.70 * 0.88 + 0.30 * 1.00 = 0.616 + 0.300 = 0.916
        expected_final = round(0.70 * 0.88 + 0.30 * 1.00, 4)
        assert result.final_score == pytest.approx(expected_final, abs=1e-4)
        assert result.is_shortlisted is True  # 0.916 >= 0.85

    def test_fraudulent_candidate_is_disqualified(self, service: TrustScoringService):
        """Candidate with high semantic similarity achieved via hidden white text is disqualified."""
        pdf_bytes = make_white_text_pdf()
        resume_text = "Summary text. " + "Python Docker Kubernetes AWS " * 15
        job_text = "Looking for an engineer skilled in Python, Docker, Kubernetes, AWS."

        result = service.evaluate(
            file_bytes=pdf_bytes,
            filename="adversarial_resume.pdf",
            resume_text=resume_text,
            job_text=job_text,
            similarity_score=0.96,  # Artificially inflated similarity
        )

        # White text penalty = 0.60, repetition penalty = 0.20 -> Trust = 1.0 - 0.80 = 0.20
        assert result.trust_score <= 0.40
        assert len(result.flags) >= 1
        # Below min_trust_threshold (0.30), final score is zeroed!
        assert result.final_score == 0.0
        assert result.is_shortlisted is False

    def test_ranking_fairness_honest_vs_cheater(self, service: TrustScoringService):
        """Honest candidate with moderate similarity MUST decisively beat a fraudulent candidate."""
        # 1. Honest candidate
        honest_res = service.evaluate(
            file_bytes=make_clean_pdf(),
            filename="honest.pdf",
            resume_text="Senior backend engineer with 6 years experience in Python and PostgreSQL.",
            job_text="Backend Engineer Python Postgres",
            similarity_score=0.80,
        )

        # 2. Adversarial candidate who stuffed hidden white text
        cheater_res = service.evaluate(
            file_bytes=make_white_text_pdf(),
            filename="cheater.pdf",
            resume_text="Backend Engineer Python Postgres " * 10,
            job_text="Backend Engineer Python Postgres",
            similarity_score=0.99,  # Artificially higher similarity!
        )

        assert honest_res.final_score > 0.80
        assert cheater_res.final_score == 0.0
        assert honest_res.final_score > cheater_res.final_score

    def test_configurable_shortlisting_threshold(self, service: TrustScoringService):
        """Verify shortlisting threshold applies correctly to final score."""
        assert service.check_shortlist(0.86, threshold=0.85) is True
        assert service.check_shortlist(0.84, threshold=0.85) is False

        # Configurable override check
        assert service.check_shortlist(0.80, threshold=0.75) is True
        assert service.check_shortlist(0.70, threshold=0.75) is False
