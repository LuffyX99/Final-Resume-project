"""FAISS Vector Index Service (Per PPT Specifications).

Provides FAISS-compatible vector indexing, persistent storage, and search
pipeline for 384-dimensional dense semantic embeddings (SBERT all-MiniLM-L6-v2).
Includes native faiss module support with a high-performance vectorized NumPy
engine fallback when faiss binary is not compiled for the runtime environment.
"""

from __future__ import annotations

import json
import logging
import math
import os
from pathlib import Path
from typing import Any, Sequence

import numpy as np

logger = logging.getLogger(__name__)

DEFAULT_DIMENSION = 384


class FAISSIndexService:
    """FAISS Vector Index Builder, Persistence, and Similarity Search Pipeline.

    Index Types:
    - "Flat" / "IndexFlatIP": Exact Inner Product / Cosine Similarity (default)
    - "L2" / "IndexFlatL2": Euclidean Distance
    - "IVF" / "IndexIVFFlat": Inverted File Index with coarse quantization
    """

    def __init__(
        self,
        dimension: int = DEFAULT_DIMENSION,
        index_type: str = "IndexFlatIP",
        nlist: int = 100,
    ) -> None:
        self.dimension = dimension
        self.index_type = index_type
        self.nlist = nlist
        self._id_to_key: list[str] = []
        self._key_to_id: dict[str, int] = {}
        self._vectors: list[np.ndarray] = []
        self._native_index: Any = None
        self._is_trained: bool = True

        self._init_backend()

    def _init_backend(self) -> None:
        try:
            import faiss

            if self.index_type in {"IndexFlatIP", "Flat", "cosine"}:
                self._native_index = faiss.IndexFlatIP(self.dimension)
            elif self.index_type in {"IndexFlatL2", "L2"}:
                self._native_index = faiss.IndexFlatL2(self.dimension)
            else:
                quantizer = faiss.IndexFlatIP(self.dimension)
                self._native_index = faiss.IndexIVFFlat(
                    quantizer, self.dimension, self.nlist, faiss.METRIC_INNER_PRODUCT
                )
                self._is_trained = False
            logger.info("Initialized native FAISS index: %s", self.index_type)
        except (ImportError, Exception):
            self._native_index = None
            logger.info("Using high-performance NumPy vectorized engine for FAISS index")

    @property
    def total_vectors(self) -> int:
        return len(self._id_to_key)

    @staticmethod
    def normalize_vector(v: np.ndarray | Sequence[float]) -> np.ndarray:
        """L2-normalize vector to unit length so Inner Product equals Cosine Similarity."""
        arr = np.asarray(v, dtype=np.float32)
        norm = np.linalg.norm(arr)
        if norm > 0:
            return arr / norm
        return arr

    def train(self, vectors: np.ndarray | list[list[float]]) -> None:
        """Train index for IVF indices."""
        arr = np.asarray(vectors, dtype=np.float32)
        if self._native_index is not None and not self._is_trained:
            self._native_index.train(arr)
        self._is_trained = True

    def add_vector(self, key: str, vector: Sequence[float] | np.ndarray) -> int:
        """Add a single labeled embedding vector to the FAISS index."""
        normalized = self.normalize_vector(vector)
        if len(normalized) != self.dimension:
            raise ValueError(
                f"Vector dimension {len(normalized)} does not match index dimension {self.dimension}"
            )

        if key in self._key_to_id:
            idx = self._key_to_id[key]
            self._vectors[idx] = normalized
            return idx

        idx = len(self._id_to_key)
        self._id_to_key.append(key)
        self._key_to_id[key] = idx
        self._vectors.append(normalized)

        if self._native_index is not None:
            if not self._is_trained:
                self.train(np.array([normalized]))
            self._native_index.add(np.expand_dims(normalized, axis=0))

        return idx

    def add_vectors(self, keys: list[str], vectors: list[Sequence[float]] | np.ndarray) -> list[int]:
        """Batch add labeled embedding vectors."""
        ids: list[int] = []
        for k, v in zip(keys, vectors):
            ids.append(self.add_vector(k, v))
        return ids

    def search(
        self,
        query_vector: Sequence[float] | np.ndarray,
        top_k: int = 10,
    ) -> list[dict[str, Any]]:
        """Search top-K nearest neighbors using cosine similarity.

        Returns list of dicts: [{"id": record_id, "score": float_similarity, "rank": int}]
        """
        if not self._vectors:
            return []

        q = self.normalize_vector(query_vector)
        k = min(top_k, len(self._vectors))

        if self._native_index is not None and self._native_index.ntotal > 0:
            import faiss

            distances, indices = self._native_index.search(np.expand_dims(q, axis=0), k)
            results = []
            for rank, (dist, idx) in enumerate(zip(distances[0], indices[0])):
                if idx < 0 or idx >= len(self._id_to_key):
                    continue
                score = float(max(0.0, min(1.0, (dist + 1.0) / 2.0 if "L2" in self.index_type else dist)))
                results.append({
                    "id": self._id_to_key[idx],
                    "score": round(score, 4),
                    "rank": rank + 1,
                })
            return results

        # Vectorized NumPy cosine similarity engine
        matrix = np.vstack(self._vectors)
        scores = np.dot(matrix, q)
        top_indices = np.argsort(scores)[::-1][:k]

        results = []
        for rank, idx in enumerate(top_indices):
            raw_score = float(scores[idx])
            clamped = float(max(0.0, min(1.0, raw_score)))
            results.append({
                "id": self._id_to_key[idx],
                "score": round(clamped, 4),
                "rank": rank + 1,
            })
        return results

    def save(self, filepath: str | Path) -> None:
        """Persist FAISS index and metadata mapping to disk."""
        path = Path(filepath)
        path.parent.mkdir(parents=True, exist_ok=True)

        meta_path = path.with_suffix(".json")
        data_path = path.with_suffix(".npy")

        metadata = {
            "dimension": self.dimension,
            "index_type": self.index_type,
            "id_to_key": self._id_to_key,
        }
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2)

        if self._vectors:
            np.save(str(data_path), np.vstack(self._vectors))
        else:
            np.save(str(data_path), np.empty((0, self.dimension), dtype=np.float32))

        logger.info("Persisted FAISS vector index to %s", path)

    @classmethod
    def load(cls, filepath: str | Path) -> "FAISSIndexService":
        """Load persisted FAISS index and metadata mapping from disk."""
        path = Path(filepath)
        meta_path = path.with_suffix(".json")
        data_path = path.with_suffix(".npy")

        if not meta_path.exists():
            raise FileNotFoundError(f"FAISS metadata not found at {meta_path}")

        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)

        service = cls(
            dimension=meta.get("dimension", DEFAULT_DIMENSION),
            index_type=meta.get("index_type", "IndexFlatIP"),
        )
        service._id_to_key = meta.get("id_to_key", [])
        service._key_to_id = {k: i for i, k in enumerate(service._id_to_key)}

        if data_path.exists():
            vectors = np.load(str(data_path))
            service._vectors = [v for v in vectors]
            if service._native_index is not None and len(service._vectors) > 0:
                service._native_index.add(vectors)

        return service
