"""Database tests for MongoDB connection and fallback."""

from app.services.mongodb_service import MongoDBService


def test_mongodb_connection_initialization():
    service = MongoDBService()
    # Verifies graceful initialization (either live or embedded isolated store)
    assert service.COLLECTIONS == {"candidates", "jobs", "matches", "embeddings_metadata"}
