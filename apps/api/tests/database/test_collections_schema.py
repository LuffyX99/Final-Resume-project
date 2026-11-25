"""Database tests for Collections Schema Validation."""

import pytest
from app.services.mongodb_service import MongoDBService


def test_candidate_and_job_schema_validation():
    mongo = MongoDBService()
    # Candidate schema requires name, email, skills
    with pytest.raises(ValueError, match="Missing required fields"):
        mongo.insert_candidate({"name": "NoEmail"})

    # Job schema requires title, description, skills
    with pytest.raises(ValueError, match="Missing required fields"):
        mongo.insert_job({"title": "NoDesc"})
