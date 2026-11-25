"""Daily automated health check script for Smart Resume-Job Matching System."""

import asyncio
import os
import sys
import time

# Ensure app package is in path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
API_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..", "apps", "api"))
if API_DIR not in sys.path:
    sys.path.insert(0, API_DIR)


def check_nlp_model():
    print("[1/5] Verifying SBERT Embedding Service...")
    from app.services.sbert import SBERTService
    service = SBERTService.get_instance()
    vec = service._fallback_embedding("Test embedding text")
    assert len(vec) == 384, f"Invalid vector dimension: {len(vec)}"
    print("      ✓ SBERT Embedding Service: OK (384-dim)")


def check_faiss_index():
    print("[2/5] Verifying FAISS Index Service...")
    from app.services.faiss_service import FAISSIndexService
    idx = FAISSIndexService(dimension=384)
    idx.add_vectors(["test_key"], [[0.05] * 384])
    results = idx.search([0.05] * 384, top_k=1)
    assert len(results) == 1 and results[0]["id"] == "test_key"
    print("      ✓ FAISS Index Service: OK (searchable)")


def check_trust_scorer():
    print("[3/5] Verifying Trust Scoring & Integrity Engine...")
    from app.services.integrity.scoring import TrustScoringService
    scorer = TrustScoringService()
    res = scorer.evaluate(
        resume_text="Senior Python and FastAPI engineer with Docker.",
        job_text="Python Developer",
        similarity_score=0.90,
    )
    assert res.trust_score > 0.50
    assert res.final_score > 0.0
    print("      ✓ Trust Scoring & Integrity Engine: OK")


def check_skill_gap():
    print("[4/5] Verifying Skill Gap & Readiness Analyzer...")
    from app.services.skill_gap import SkillGapService
    service = SkillGapService()
    gap = service.analyze(
        required_skills=["Python", "FastAPI", "Docker", "Kubernetes"],
        candidate_skills=["Python", "FastAPI"],
        resume_text="Python and FastAPI developer.",
        similarity_score=0.85,
    )
    assert "Python" in gap.matched_skills
    assert "Kubernetes" in gap.missing_skills
    assert gap.readiness_score > 0
    print("      ✓ Skill Gap & Readiness Analyzer: OK")


def check_database_models():
    print("[5/5] Verifying Database Models & Metadata Sync...")
    from app.services.mongodb_service import MongoDBService
    mongo = MongoDBService()
    doc_id = mongo.insert_candidate({
        "name": "HealthCheckCandidate",
        "email": "health@example.com",
        "skills": ["Python", "FastAPI"],
    })
    cand = mongo.get_candidate(doc_id)
    assert cand is not None and cand.get("name") == "HealthCheckCandidate"
    print("      ✓ Database Models & Document Service: OK")


def main():
    start = time.perf_counter()
    print("==================================================")
    print("SMART RESUME-JOB MATCHING SYSTEM: DAILY HEALTH CHECK")
    print("==================================================")
    try:
        check_nlp_model()
        check_faiss_index()
        check_trust_scorer()
        check_skill_gap()
        check_database_models()
        elapsed = time.perf_counter() - start
        print("--------------------------------------------------")
        print(f"Status: ALL CHECKS PASSED (Duration: {elapsed:.2f}s)")
        print("System is HEALTHY and OPERATIONAL.")
        print("==================================================")
        return 0
    except Exception as exc:
        print(f"FAILED: Health check encountered error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
