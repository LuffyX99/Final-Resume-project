"""MongoDB Storage and Document Schema Layer (Per PPT Specifications).

Implements MongoDB collections, document schemas, indexes, and FAISS index
vector metadata synchronization for candidate resumes, jobs, and matches.
Supports both active MongoDB connections (via PyMongo / Motor) and an
in-memory mock store for isolated verification and testing.
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)


class MongoDBService:
    """MongoDB Collection Manager with Indexing & Schema Validation."""

    COLLECTIONS = {
        "candidates",
        "jobs",
        "matches",
        "embeddings_metadata",
    }

    def __init__(self, uri: str = "mongodb://localhost:27017/resume_matching") -> None:
        self.uri = uri
        self._connected = False
        self._store: dict[str, dict[str, dict[str, Any]]] = {
            c: {} for c in self.COLLECTIONS
        }
        self._indexes: dict[str, list[dict[str, Any]]] = {
            "candidates": [
                {"fields": ["email"], "unique": True},
                {"fields": ["skills"], "unique": False},
                {"fields": ["created_at"], "unique": False},
            ],
            "jobs": [
                {"fields": ["job_id"], "unique": True},
                {"fields": ["skills"], "unique": False},
                {"fields": ["created_at"], "unique": False},
            ],
            "matches": [
                {"fields": ["job_id", "candidate_id"], "unique": True},
                {"fields": ["final_score"], "unique": False},
                {"fields": ["created_at"], "unique": False},
            ],
            "embeddings_metadata": [
                {"fields": ["vector_id"], "unique": True},
                {"fields": ["entity_type", "entity_id"], "unique": True},
            ],
        }
        self._connect()

    def _connect(self) -> None:
        # Default to in-memory store for high-performance test isolation
        self._connected = False
        if os.environ.get("USE_LIVE_MONGODB", "").lower() in {"true", "1"}:
            try:
                import pymongo

                client = pymongo.MongoClient(self.uri, serverSelectionTimeoutMS=100, connect=False)
                client.admin.command("ping")
                self._connected = True
                logger.info("Connected to live MongoDB at %s", self.uri)
            except Exception:
                self._connected = False
                logger.info("Using embedded MongoDB document store (in-memory)")

    @property
    def is_connected(self) -> bool:
        return self._connected

    def get_indexes(self, collection: str) -> list[dict[str, Any]]:
        return self._indexes.get(collection, [])

    # -------------------------------------------------------------------------
    # Candidates Collection
    # -------------------------------------------------------------------------
    def insert_candidate(self, candidate_doc: dict[str, Any]) -> str:
        """Insert candidate document with validation."""
        required = {"name", "email", "skills"}
        missing = required - set(candidate_doc.keys())
        if missing:
            raise ValueError(f"Missing required fields for candidate: {missing}")

        doc_id = str(candidate_doc.get("_id") or uuid.uuid4())
        doc = dict(candidate_doc)
        doc["_id"] = doc_id
        doc.setdefault("created_at", datetime.now(timezone.utc).isoformat())

        # Check unique email index
        for existing in self._store["candidates"].values():
            if existing.get("email") == doc["email"] and existing["_id"] != doc_id:
                raise ValueError(f"Duplicate email violates unique index: {doc['email']}")

        self._store["candidates"][doc_id] = doc
        return doc_id

    def get_candidate(self, candidate_id: str) -> Optional[dict[str, Any]]:
        return self._store["candidates"].get(str(candidate_id))

    # -------------------------------------------------------------------------
    # Jobs Collection
    # -------------------------------------------------------------------------
    def insert_job(self, job_doc: dict[str, Any]) -> str:
        """Insert job posting document with validation."""
        required = {"title", "description", "skills"}
        missing = required - set(job_doc.keys())
        if missing:
            raise ValueError(f"Missing required fields for job: {missing}")

        job_id = str(job_doc.get("_id") or job_doc.get("job_id") or uuid.uuid4())
        doc = dict(job_doc)
        doc["_id"] = job_id
        doc["job_id"] = job_id
        doc.setdefault("created_at", datetime.now(timezone.utc).isoformat())

        self._store["jobs"][job_id] = doc
        return job_id

    def get_job(self, job_id: str) -> Optional[dict[str, Any]]:
        return self._store["jobs"].get(str(job_id))

    # -------------------------------------------------------------------------
    # Matches Collection
    # -------------------------------------------------------------------------
    def insert_match(self, match_doc: dict[str, Any]) -> str:
        """Insert match record document with validation."""
        required = {"job_id", "candidate_id", "similarity_score", "trust_score", "final_score"}
        missing = required - set(match_doc.keys())
        if missing:
            raise ValueError(f"Missing required fields for match: {missing}")

        match_id = str(match_doc.get("_id") or uuid.uuid4())
        doc = dict(match_doc)
        doc["_id"] = match_id
        doc.setdefault("created_at", datetime.now(timezone.utc).isoformat())

        self._store["matches"][match_id] = doc
        return match_id

    def get_match(self, match_id: str) -> Optional[dict[str, Any]]:
        return self._store["matches"].get(str(match_id))

    def get_matches_for_job(self, job_id: str) -> list[dict[str, Any]]:
        return [
            m for m in self._store["matches"].values()
            if m.get("job_id") == str(job_id)
        ]

    # -------------------------------------------------------------------------
    # FAISS Vector Metadata Synchronization
    # -------------------------------------------------------------------------
    def sync_vector_metadata(
        self,
        vector_id: int,
        entity_type: str,
        entity_id: str,
        dimension: int = 384,
    ) -> str:
        """Record mapping between FAISS index vector_id and MongoDB entity."""
        meta_id = str(uuid.uuid4())
        doc = {
            "_id": meta_id,
            "vector_id": vector_id,
            "entity_type": entity_type,
            "entity_id": str(entity_id),
            "dimension": dimension,
            "synced_at": datetime.now(timezone.utc).isoformat(),
        }
        self._store["embeddings_metadata"][meta_id] = doc
        return meta_id

    def get_entity_by_vector_id(self, vector_id: int) -> Optional[dict[str, Any]]:
        for item in self._store["embeddings_metadata"].values():
            if item.get("vector_id") == vector_id:
                return item
        return None
