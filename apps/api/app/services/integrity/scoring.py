import logging
from typing import Sequence

from app.config import settings
from app.services.integrity.hidden_text import HiddenTextDetector
from app.services.integrity.keyword_stuffing import KeywordStuffingDetector
from app.services.integrity.models import (
    FlagSeverity,
    TrustEvaluationResult,
    TrustFlag,
)

logger = logging.getLogger(__name__)


def clamp01(v: float) -> float:
    return max(0.0, min(1.0, float(v)))


def round4(v: float) -> float:
    return round(float(v), 4)


class TrustScoringService:
    """Orchestrates document fraud detection, trust scoring, and final ranking."""

    def __init__(
        self,
        hidden_detector: HiddenTextDetector | None = None,
        stuffing_detector: KeywordStuffingDetector | None = None,
    ):
        self.hidden_detector = hidden_detector or HiddenTextDetector()
        self.stuffing_detector = stuffing_detector or KeywordStuffingDetector()

    def compute_final_score(
        self,
        similarity_score: float,
        trust_score: float,
        sim_weight: float | None = None,
        trust_weight: float | None = None,
        min_trust: float | None = None,
        mode: str | None = None,
    ) -> float:
        """Compute final ranking score using fraud-gated blend or multiplicative scaling.

        Modes:
        - "multiplicative": Final Score = Similarity * Trust (PPT specification)
        - "weighted": Final Score = (w_sim * Similarity) + (w_trust * Trust)

        If trust score falls below min_trust_threshold, the candidate is
        disqualified with a final score of 0.0 to prevent adversarial manipulation
        from outranking authentic candidates.
        """
        threshold = min_trust if min_trust is not None else settings.min_trust_threshold
        scoring_mode = mode or getattr(settings, "scoring_mode", "weighted")

        sim = clamp01(similarity_score)
        trust = clamp01(trust_score)

        if trust < threshold:
            return 0.0

        if scoring_mode == "multiplicative":
            score = sim * trust
        else:
            w_sim = sim_weight if sim_weight is not None else settings.similarity_weight
            w_trust = trust_weight if trust_weight is not None else settings.trust_weight
            score = (w_sim * sim) + (w_trust * trust)

        return round4(clamp01(score))

    def check_shortlist(self, final_score: float, threshold: float | None = None) -> bool:
        """Determine if application meets the configurable shortlisting threshold."""
        th = threshold if threshold is not None else settings.shortlist_threshold
        return clamp01(final_score) >= th

    def evaluate(
        self,
        *,
        file_bytes: bytes = b"",
        filename: str = "",
        resume_text: str = "",
        job_text: str = "",
        job_required_skills: list[str] | None = None,
        similarity_score: float = 0.0,
    ) -> TrustEvaluationResult:
        """Run full fraud & integrity inspection, compute trust and final scores."""
        flags: list[TrustFlag] = []

        # 1. Inspect raw file structure for hidden text (PDF & DOCX)
        if file_bytes and filename:
            try:
                flags.extend(self.hidden_detector.inspect(file_bytes, filename))
            except Exception as exc:
                logger.warning("Hidden text detection failed: %s", exc)

        # 2. Inspect text content for keyword stuffing and verbatim injection
        if resume_text:
            try:
                flags.extend(
                    self.stuffing_detector.inspect(
                        resume_text=resume_text,
                        job_text=job_text,
                        job_required_skills=job_required_skills,
                    )
                )
            except Exception as exc:
                logger.warning("Keyword stuffing detection failed: %s", exc)

        # 3. Calculate Trust Score: 1.0 minus cumulative penalty deductions
        total_penalty = sum(f.penalty for f in flags)
        trust_score = round4(clamp01(1.0 - total_penalty))

        # 4. Compute Final Score
        final_score = self.compute_final_score(similarity_score, trust_score)

        # 5. Check Shortlisting
        shortlisted = self.check_shortlist(final_score)

        return TrustEvaluationResult(
            trust_score=trust_score,
            flags=flags,
            similarity_score=round4(clamp01(similarity_score)),
            final_score=final_score,
            is_shortlisted=shortlisted,
        )
