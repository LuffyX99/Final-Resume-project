"""Database tests for Document CRUD Operations."""

from app.services.mongodb_service import MongoDBService


def test_crud_operations():
    mongo = MongoDBService()
    # Create
    cid = mongo.insert_candidate({
        "name": "David Miller",
        "email": "david@example.com",
        "skills": ["Go", "Kubernetes"],
    })
    assert cid is not None

    # Read
    doc = mongo.get_candidate(cid)
    assert doc is not None
    assert doc["email"] == "david@example.com"
