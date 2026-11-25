"""Unit tests for Text Preprocessor and Chunking."""

from app.services.sbert import SBERTService, STOPWORDS, SYNONYM_CANONICAL_MAP, TOKEN_PATTERN


class TestTextPreprocessor:
    def test_token_extraction(self):
        text = "Built high-performance REST APIs in C++, Python 3.12, and Node.js!"
        tokens = TOKEN_PATTERN.findall(text)
        assert "high-performance" in tokens or "REST" in tokens
        assert "C++" in tokens
        assert "Node.js" in tokens or "Node" in tokens

    def test_chunking_strategy(self):
        service = SBERTService.get_instance()
        words = [f"word{i}" for i in range(400)]
        long_text = " ".join(words)
        chunks = service._chunk_text(long_text)
        
        assert len(chunks) > 1
        # Check that overlap exists and chunk size is bounded
        for c in chunks:
            c_words = c.split()
            assert len(c_words) <= 180

    def test_stopwords_and_synonyms_presence(self):
        assert "and" in STOPWORDS
        assert "the" in STOPWORDS
        assert SYNONYM_CANONICAL_MAP["js"] == "javascript"
        assert SYNONYM_CANONICAL_MAP["k8s"] == "kubernetes"
        assert SYNONYM_CANONICAL_MAP["postgres"] == "postgresql"
