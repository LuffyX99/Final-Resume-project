import asyncio
import hashlib
import logging
import math
import re
from collections import Counter
from typing import ClassVar

logger = logging.getLogger(__name__)

SBERT_MODEL_NAME = "all-MiniLM-L6-v2"
SBERT_DIMENSION = 384
MAX_CHUNK_WORDS = 180
CHUNK_OVERLAP_WORDS = 30

TOKEN_PATTERN = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9+#.-]*")

STOPWORDS = {
    "and", "with", "in", "for", "at", "the", "a", "an", "of", "to", "on",
    "is", "are", "by", "as", "from", "into", "that", "this", "or",
}

# Curated semantic synonym map to bridge domain terminology when running offline
SYNONYM_CANONICAL_MAP = {
    "js": "javascript",
    "javascript": "javascript",
    "ts": "typescript",
    "typescript": "typescript",
    "py": "python",
    "python": "python",
    "k8s": "kubernetes",
    "kube": "kubernetes",
    "kubernetes": "kubernetes",
    "postgres": "postgresql",
    "psql": "postgresql",
    "postgresql": "postgresql",
    "sql": "database",
    "rdbms": "database",
    "dba": "database_admin",
    "database": "database",
    "administrator": "database_admin",
    "admin": "database_admin",
    "developer": "software_engineer",
    "programmer": "software_engineer",
    "engineer": "software_engineer",
    "coder": "software_engineer",
    "development": "software_engineer",
    "programming": "software_engineer",
    "reactjs": "react",
    "react.js": "react",
    "react": "react",
    "vuejs": "vue",
    "vue.js": "vue",
    "angularjs": "angular",
    "nodejs": "node",
    "node.js": "node",
    "node": "node",
    "aws": "cloud_infrastructure",
    "gcp": "cloud_infrastructure",
    "azure": "cloud_infrastructure",
    "docker": "container_orchestration",
    "container": "container_orchestration",
    "containers": "container_orchestration",
    "orchestration": "container_orchestration",
    "cluster": "infrastructure_cluster",
    "infrastructure": "infrastructure_cluster",
    "devops": "infrastructure_automation",
    "sre": "infrastructure_automation",
    "ml": "machine_learning",
    "ai": "artificial_intelligence",
    "dl": "deep_learning",
    "nlp": "natural_language_processing",
    "cv": "computer_vision",
    "llm": "large_language_model",
    "rest": "restful_api",
    "restful": "restful_api",
    "api": "restful_api",
    "apis": "restful_api",
    "web": "web_application",
    "website": "web_application",
    "applications": "web_application",
    "software": "web_application",
    "app": "web_application",
    "apps": "web_application",
    "tuning": "performance_tuning",
    "optimization": "performance_tuning",
    "performance": "performance_tuning",
    "indexes": "database_indexes",
    "indexing": "database_indexes",
    "microservices": "distributed_systems",
    "golang": "go",
}


class SBERTService:
    """SBERT-based semantic embedding service.

    Loads the model once at startup and executes inference off the event loop
    via worker threads to ensure FastAPI remains completely non-blocking.
    Includes chunking + weighted mean pooling for long documents, and a
    deterministic semantic fallback for offline/isolated execution.
    """

    _instance: ClassVar["SBERTService | None"] = None

    def __init__(self, model_name: str = SBERT_MODEL_NAME):
        self.model_name = model_name
        self.dimension = SBERT_DIMENSION
        self._model = None
        self._model_loaded = False
        self._load_model()

    def _load_model(self) -> None:
        """Attempt to load sentence-transformers model once."""
        try:
            from sentence_transformers import SentenceTransformer  # type: ignore

            logger.info("Loading SBERT model '%s'...", self.model_name)
            self._model = SentenceTransformer(self.model_name)
            self._model_loaded = True
            logger.info("SBERT model '%s' loaded successfully.", self.model_name)
        except Exception as exc:
            logger.warning(
                "Sentence-Transformers model '%s' unavailable (%s). "
                "Using semantic token-hash projection fallback (dim=%d).",
                self.model_name,
                exc,
                self.dimension,
            )
            self._model = None
            self._model_loaded = False

    @classmethod
    def get_instance(cls) -> "SBERTService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @property
    def is_model_loaded(self) -> bool:
        return self._model_loaded

    def _chunk_text(self, text: str) -> list[str]:
        """Split text into overlapping chunks that fit within SBERT token windows."""
        words = text.split()
        if len(words) <= MAX_CHUNK_WORDS:
            return [text]

        chunks: list[str] = []
        step = MAX_CHUNK_WORDS - CHUNK_OVERLAP_WORDS
        for i in range(0, len(words), step):
            chunk = " ".join(words[i : i + MAX_CHUNK_WORDS])
            if chunk.strip():
                chunks.append(chunk)
            if i + MAX_CHUNK_WORDS >= len(words):
                break
        return chunks if chunks else [text]

    def _encode_chunk_sync(self, chunk: str) -> list[float]:
        """Synchronous inference for a single chunk."""
        if self._model is not None:
            # normalize_embeddings=True gives unit length vectors for cosine similarity
            embedding = self._model.encode(
                chunk, normalize_embeddings=True, show_progress_bar=False
            )
            return [float(x) for x in embedding]
        return self._fallback_embedding(chunk)

    def _encode_text_sync(self, text: str) -> list[float]:
        """Synchronous chunking, inference, and length-weighted pooling."""
        cleaned = text.strip()
        if not cleaned:
            raise ValueError("Cannot generate embedding for empty text")

        chunks = self._chunk_text(cleaned)
        if len(chunks) == 1:
            return self._encode_chunk_sync(chunks[0])

        embeddings: list[list[float]] = []
        weights: list[int] = []

        for chunk in chunks:
            chunk_vec = self._encode_chunk_sync(chunk)
            embeddings.append(chunk_vec)
            weights.append(max(1, len(chunk.split())))

        # Length-weighted mean pooling
        total_weight = sum(weights)
        pooled = [0.0] * self.dimension
        for emb, weight in zip(embeddings, weights):
            for i, val in enumerate(emb):
                pooled[i] += val * weight

        # Re-normalize to unit length
        magnitude = math.sqrt(sum(v * v for v in pooled))
        if magnitude > 0:
            pooled = [v / magnitude for v in pooled]

        return pooled

    def _fallback_embedding(self, text: str) -> list[float]:
        """High-fidelity semantic fallback when sentence-transformers is offline.

        Projects subwords, n-grams, and semantic canonical synonyms into a
        unit-normalized 384-dimensional vector space using a multi-hash
        distributed projection.
        """
        raw_tokens = [t.lower() for t in TOKEN_PATTERN.findall(text)]
        if not raw_tokens:
            raise ValueError("Cannot generate embedding for empty text")

        # Canonicalize domain synonyms and remove non-discriminative stopwords
        filtered_tokens = [t for t in raw_tokens if t not in STOPWORDS]
        if not filtered_tokens:
            filtered_tokens = raw_tokens

        tokens: list[str] = [
            SYNONYM_CANONICAL_MAP.get(token, token)
            for token in filtered_tokens
        ]

        canonical_values = set(SYNONYM_CANONICAL_MAP.values())
        vector = [0.0] * self.dimension

        # Distributed dense projection: each token activates multiple dimensions
        for term in tokens:
            weight = 3.0 if term in canonical_values else 1.0
            term_bytes = term.encode("utf-8")
            for seed in range(16):
                digest = hashlib.blake2b(
                    term_bytes + bytes([seed]), digest_size=8
                ).digest()
                index = int.from_bytes(digest[:4], "little") % self.dimension
                sign = 1.0 if digest[4] & 1 else -1.0
                vector[index] += sign * weight

        magnitude = math.sqrt(sum(v * v for v in vector))
        if magnitude == 0:
            return vector
        return [v / magnitude for v in vector]

    async def get_embedding(self, text: str) -> list[float]:
        """Generate a 384-dimensional embedding off the main event loop."""
        text = text.strip()
        if not text:
            raise ValueError("Cannot generate embedding for empty text")

        # When the neural model is loaded, run CPU-intensive inference off the
        # event loop in a worker thread so FastAPI remains non-blocking.
        # If the model is not loaded (offline fallback) or thread dispatch fails,
        # run the fast hash projection directly without thread context-switching overhead.
        if self._model is not None:
            try:
                return await asyncio.to_thread(self._encode_text_sync, text)
            except Exception as exc:
                logger.warning("Thread dispatch failed (%s), running sync", exc)
                return self._encode_text_sync(text)

        return self._encode_text_sync(text)

    async def get_embeddings_batch(self, texts: list[str]) -> list[list[float]]:
        """Batch embedding off the event loop."""
        tasks = [self.get_embedding(text) for text in texts]
        return await asyncio.gather(*tasks)


def get_sbert_service() -> SBERTService:
    return SBERTService.get_instance()
