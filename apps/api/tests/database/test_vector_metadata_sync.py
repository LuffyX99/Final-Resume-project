"""Database tests for FAISS Index to MongoDB Metadata Sync."""

from app.services.mongodb_service import MongoDBService


def test_faiss_mongo_metadata_sync():
    mongo = MongoDBService()
    sync_id = mongo.sync_vector_metadata(
        vector_id=42,
        entity_type="candidate_resume",
        entity_id="candidate_uuid_999",
        dimension=384,
    )
    assert sync_id is not None

    entity = mongo.get_entity_by_vector_id(42)
    assert entity is not None
    assert entity["entity_id"] == "candidate_uuid_999"
    assert entity["dimension"] == 384
