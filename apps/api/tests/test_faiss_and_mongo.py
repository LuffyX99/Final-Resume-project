"""Tests for FAISS Vector Index and MongoDB Layer (Per PPT Specifications).

Verifies:
1. FAISS index building, 384-dimension vector normalization, similarity search.
2. Index persistence (save and load).
3. Nearest neighbor search accuracy.
4. MongoDB collections, schema validation, index definitions, and CRUD ops.
5. FAISS vector index to MongoDB metadata mapping synchronization.
6. Multiplicative scoring mode (Final Score = Similarity * Trust).
"""

import tempfile
from pathlib import Path

import numpy as np
import pytest

from app.services.faiss_service import FAISSIndexService
from app.services.integrity.scoring import TrustScoringService
from app.services.mongodb_service import MongoDBService


class TestFAISSIndexService:
    def test_faiss_build_and_search(self):
        index = FAISSIndexService(dimension=384, index_type="IndexFlatIP")
        
        # Add 3 distinct vectors
        vec1 = [1.0] + [0.0] * 383
        vec2 = [0.0, 1.0] + [0.0] * 382
        vec3 = [0.5, 0.5] + [0.0] * 382
        
        index.add_vector("cand_1", vec1)
        index.add_vector("cand_2", vec2)
        index.add_vector("cand_3", vec3)
        
        assert index.total_vectors == 3
        
        # Query closest to vec1
        results = index.search(vec1, top_k=2)
        assert len(results) == 2
        assert results[0]["id"] == "cand_1"
        assert results[0]["score"] == pytest.approx(1.0, abs=1e-3)
        assert results[0]["rank"] == 1

    def test_faiss_persistence(self):
        index = FAISSIndexService(dimension=384)
        vec = [0.2] * 384
        index.add_vector("doc_42", vec)
        
        with tempfile.TemporaryDirectory() as tmpdir:
            save_path = Path(tmpdir) / "faiss_store.index"
            index.save(save_path)
            
            # Reload index
            loaded = FAISSIndexService.load(save_path)
            assert loaded.total_vectors == 1
            res = loaded.search(vec, top_k=1)
            assert res[0]["id"] == "doc_42"
            assert res[0]["score"] == pytest.approx(1.0, abs=1e-3)

    def test_multiplicative_scoring_mode(self):
        scorer = TrustScoringService()
        # Per PPT spec: Final Score = Similarity * Trust
        score = scorer.compute_final_score(
            similarity_score=0.80,
            trust_score=0.90,
            mode="multiplicative",
        )
        assert score == pytest.approx(0.72, abs=1e-4)


class TestMongoDBService:
    def test_candidate_crud_and_validation(self):
        mongo = MongoDBService()
        
        # Missing required field raises ValueError
        with pytest.raises(ValueError, match="Missing required fields"):
            mongo.insert_candidate({"name": "Test Candidate"})
            
        cid = mongo.insert_candidate({
            "name": "Alice Smith",
            "email": "alice@example.com",
            "skills": ["Python", "FastAPI"],
        })
        assert cid is not None
        
        doc = mongo.get_candidate(cid)
        assert doc["name"] == "Alice Smith"
        assert doc["skills"] == ["Python", "FastAPI"]
        
        # Duplicate email violates unique index
        with pytest.raises(ValueError, match="Duplicate email"):
            mongo.insert_candidate({
                "name": "Alice Duplicate",
                "email": "alice@example.com",
                "skills": ["Java"],
            })

    def test_job_and_match_crud(self):
        mongo = MongoDBService()
        jid = mongo.insert_job({
            "title": "Backend Lead",
            "description": "Lead the platform engineering team.",
            "skills": ["Python", "Kubernetes", "PostgreSQL"],
        })
        assert jid is not None
        
        mid = mongo.insert_match({
            "job_id": jid,
            "candidate_id": "cand_123",
            "similarity_score": 0.85,
            "trust_score": 0.95,
            "final_score": 0.8075,
        })
        assert mid is not None
        
        matches = mongo.get_matches_for_job(jid)
        assert len(matches) == 1
        assert matches[0]["final_score"] == 0.8075

    def test_vector_metadata_synchronization(self):
        mongo = MongoDBService()
        meta_id = mongo.sync_vector_metadata(
            vector_id=7,
            entity_type="candidate",
            entity_id="candidate_abc",
            dimension=384,
        )
        assert meta_id is not None
        
        entity = mongo.get_entity_by_vector_id(7)
        assert entity["entity_id"] == "candidate_abc"
        assert entity["dimension"] == 384
