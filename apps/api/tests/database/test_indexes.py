"""Database tests for Indexes verification."""

from app.services.mongodb_service import MongoDBService


def test_index_definitions_on_query_fields():
    mongo = MongoDBService()
    cand_indexes = mongo.get_indexes("candidates")
    fields = [idx["fields"] for idx in cand_indexes]
    assert ["email"] in fields
    assert ["skills"] in fields
    assert ["created_at"] in fields

    job_indexes = mongo.get_indexes("jobs")
    job_fields = [idx["fields"] for idx in job_indexes]
    assert ["job_id"] in job_fields
    assert ["skills"] in job_fields
