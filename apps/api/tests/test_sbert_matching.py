import math
import pytest
from app.services.matching import cosine_similarity
from app.services.sbert import SBERT_DIMENSION, SBERTService


@pytest.fixture
def sbert_service() -> SBERTService:
    return SBERTService.get_instance()


class TestSBERTService:
    @pytest.mark.asyncio
    async def test_embedding_dimension_and_normalization(
        self, sbert_service: SBERTService
    ):
        """Embedding dimension must be exactly 384 and unit-normalized."""
        text = "Senior Python engineer with FastAPI and Docker experience."
        embedding = await sbert_service.get_embedding(text)

        assert len(embedding) == SBERT_DIMENSION
        assert SBERT_DIMENSION == 384

        magnitude = math.sqrt(sum(x * x for x in embedding))
        assert abs(magnitude - 1.0) < 1e-4

    @pytest.mark.asyncio
    async def test_empty_text_raises_value_error(
        self, sbert_service: SBERTService
    ):
        """Empty or whitespace-only text must raise ValueError."""
        with pytest.raises(ValueError, match="Cannot generate embedding for empty text"):
            await sbert_service.get_embedding("   ")

    @pytest.mark.asyncio
    async def test_long_document_chunking_and_pooling(
        self, sbert_service: SBERTService
    ):
        """Long text exceeding MAX_CHUNK_WORDS is split, encoded, and pooled."""
        # Create a 350-word resume text
        long_resume = " ".join(
            [
                "Engineer with extensive background in scalable distributed backend systems.",
                "Designed microservices using Python, FastAPI, PostgreSQL, Redis, and Kafka.",
                "Implemented event-driven architectures with high throughput and low latency.",
                "Managed Kubernetes clusters and CI/CD deployment pipelines on AWS infrastructure.",
            ]
            * 15
        )
        assert len(long_resume.split()) > 200

        embedding = await sbert_service.get_embedding(long_resume)
        assert len(embedding) == SBERT_DIMENSION

        magnitude = math.sqrt(sum(x * x for x in embedding))
        assert abs(magnitude - 1.0) < 1e-4

    @pytest.mark.asyncio
    async def test_batch_embedding_generation(
        self, sbert_service: SBERTService
    ):
        """Batch embedding generates parallel 384-d vectors."""
        texts = [
            "Frontend developer proficient in React and TypeScript.",
            "DevOps specialist automating cloud infrastructure with Terraform.",
            "Data scientist training transformer models with PyTorch.",
        ]
        embeddings = await sbert_service.get_embeddings_batch(texts)
        assert len(embeddings) == 3
        for emb in embeddings:
            assert len(emb) == SBERT_DIMENSION
            magnitude = math.sqrt(sum(x * x for x in emb))
            assert abs(magnitude - 1.0) < 1e-4


class TestSemanticSynonymMatching:
    """Tests proving semantic matching captures domain meaning over exact keyword matching.

    We test domain synonym pairs that share zero exact keywords for key skills
    (e.g., 'JS' vs 'JavaScript', 'K8s' vs 'Kubernetes', 'Postgres' vs 'PostgreSQL')
    and assert they have high semantic similarity, while unrelated domains have low similarity.
    """

    @pytest.mark.asyncio
    async def test_js_and_javascript_semantic_equivalence(
        self, sbert_service: SBERTService
    ):
        query_a = "Senior JS developer building web applications"
        query_b = "Senior JavaScript programmer creating website software"

        emb_a = await sbert_service.get_embedding(query_a)
        emb_b = await sbert_service.get_embedding(query_b)

        sim = cosine_similarity(emb_a, emb_b)
        # Synonym similarity must be strong
        assert sim >= 0.65, f"Expected high similarity for JS vs JavaScript, got {sim}"

    @pytest.mark.asyncio
    async def test_k8s_and_kubernetes_semantic_equivalence(
        self, sbert_service: SBERTService
    ):
        query_a = "K8s cluster deployment and container orchestration"
        query_b = "Kubernetes infrastructure management with containers"

        emb_a = await sbert_service.get_embedding(query_a)
        emb_b = await sbert_service.get_embedding(query_b)

        sim = cosine_similarity(emb_a, emb_b)
        assert sim >= 0.65, f"Expected high similarity for K8s vs Kubernetes, got {sim}"

    @pytest.mark.asyncio
    async def test_postgres_and_postgresql_dba_semantic_equivalence(
        self, sbert_service: SBERTService
    ):
        query_a = "Postgres DBA handling query tuning and index optimization"
        query_b = "PostgreSQL database administrator managing performance and indexes"

        emb_a = await sbert_service.get_embedding(query_a)
        emb_b = await sbert_service.get_embedding(query_b)

        sim = cosine_similarity(emb_a, emb_b)
        assert sim >= 0.65, f"Expected high similarity for Postgres vs PostgreSQL, got {sim}"

    @pytest.mark.asyncio
    async def test_semantic_separation_from_unrelated_domain(
        self, sbert_service: SBERTService
    ):
        tech_job = "Senior JavaScript programmer with React and Node experience"
        unrelated_resume = (
            "Certified public accountant with 10 years experience in corporate tax auditing, "
            "payroll compliance, and general ledger reconciliation."
        )

        emb_tech = await sbert_service.get_embedding(tech_job)
        emb_unrelated = await sbert_service.get_embedding(unrelated_resume)

        unrelated_sim = cosine_similarity(emb_tech, emb_unrelated)
        assert unrelated_sim <= 0.30, f"Expected low similarity for tech vs accounting, got {unrelated_sim}"

        # Contrast with tech synonym
        tech_synonym = "Expert JS engineer specializing in React and Node"
        emb_synonym = await sbert_service.get_embedding(tech_synonym)
        synonym_sim = cosine_similarity(emb_tech, emb_synonym)

        assert synonym_sim > unrelated_sim + 0.35, (
            f"Synonym sim ({synonym_sim}) must decisively exceed unrelated sim ({unrelated_sim})"
        )
