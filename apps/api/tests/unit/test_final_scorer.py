"""Unit tests for Final Scorer (Similarity × Trust formula and modes)."""

import pytest
from app.services.integrity.scoring import TrustScoringService


class TestFinalScorer:
    def test_multiplicative_scoring_formula(self):
        scorer = TrustScoringService()
        # Per PPT Spec: Final Score = Similarity * Trust
        score = scorer.compute_final_score(
            similarity_score=0.85,
            trust_score=0.90,
            mode="multiplicative",
        )
        assert score == pytest.approx(0.765, abs=1e-4)

    def test_weighted_scoring_formula(self):
        scorer = TrustScoringService()
        score = scorer.compute_final_score(
            similarity_score=0.80,
            trust_score=1.00,
            sim_weight=0.70,
            trust_weight=0.30,
            mode="weighted",
        )
        assert score == pytest.approx(0.86, abs=1e-4)

    def test_below_min_trust_threshold_zeroes_score(self):
        scorer = TrustScoringService()
        score = scorer.compute_final_score(
            similarity_score=0.99,
            trust_score=0.20,  # Below min threshold 0.30
            min_trust=0.30,
        )
        assert score == 0.0

    def test_shortlist_check_threshold(self):
        scorer = TrustScoringService()
        assert scorer.check_shortlist(0.86, threshold=0.85) is True
        assert scorer.check_shortlist(0.84, threshold=0.85) is False
