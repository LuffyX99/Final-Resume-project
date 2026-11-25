"""Unit tests for FAISS Vector Index (Build, Search, Persistence)."""

import tempfile
from pathlib import Path
import pytest
from app.services.faiss_service import FAISSIndexService


class TestFAISSIndex:
    def test_add_and_search_vectors(self):
        index = FAISSIndexService(dimension=384)
        vec_a = [0.0] * 384
        vec_a[0] = 1.0

        vec_b = [0.0] * 384
        vec_b[1] = 1.0

        index.add_vector("doc_1", vec_a)
        index.add_vector("doc_2", vec_b)
        assert index.total_vectors == 2

        results = index.search(vec_a, top_k=2)
        assert len(results) == 2
        assert results[0]["id"] == "doc_1"
        assert results[0]["score"] == pytest.approx(1.0, abs=1e-3)
        assert results[1]["id"] == "doc_2"
        assert results[1]["score"] == pytest.approx(0.0, abs=1e-3)

    def test_dimension_validation(self):
        index = FAISSIndexService(dimension=384)
        with pytest.raises(ValueError, match="does not match index dimension"):
            index.add_vector("bad", [0.1] * 128)

    def test_index_save_and_load(self):
        index = FAISSIndexService(dimension=384)
        v = [0.5] * 384
        index.add_vector("sample_key", v)

        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = Path(tmpdir) / "test_faiss.index"
            index.save(file_path)

            loaded = FAISSIndexService.load(file_path)
            assert loaded.total_vectors == 1
            res = loaded.search(v, top_k=1)
            assert res[0]["id"] == "sample_key"
