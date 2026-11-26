"""Unit tests for FAISS Vector Index (Build, Search, Persistence)."""

import tempfile
import sys
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
from app.services.faiss_service import FAISSIndexService


class TestFAISSIndex:
    def test_empty_search_returns_no_results(self):
        index = FAISSIndexService(dimension=3)
        assert index.search([1.0, 0.0, 0.0]) == []

    def test_zero_vector_normalization_is_stable(self):
        normalized = FAISSIndexService.normalize_vector([0.0, 0.0, 0.0])
        assert normalized.tolist() == [0.0, 0.0, 0.0]

    def test_native_index_replacement_updates_search_results(self, monkeypatch):
        fake_faiss = make_fake_faiss()
        monkeypatch.setitem(sys.modules, "faiss", fake_faiss)
        index = FAISSIndexService(dimension=2)

        index.add_vector("a", [1.0, 0.0])
        index.add_vector("b", [1.0, 0.0])
        assert index.add_vector("a", [0.0, 1.0]) == 0

        result = index.search([0.0, 1.0], top_k=1)
        assert result[0]["id"] == "a"
        assert result[0]["score"] == pytest.approx(1.0)

    def test_native_l2_identical_vector_scores_one(self, monkeypatch):
        monkeypatch.setitem(sys.modules, "faiss", make_fake_faiss())
        index = FAISSIndexService(dimension=2, index_type="IndexFlatL2")
        index.add_vector("a", [1.0, 0.0])

        assert index.search([1.0, 0.0])[0]["score"] == pytest.approx(1.0)

    def test_ivf_requires_enough_training_vectors(self, monkeypatch):
        monkeypatch.setitem(sys.modules, "faiss", make_fake_faiss())
        index = FAISSIndexService(dimension=2, index_type="IVF", nlist=2)
        with pytest.raises(ValueError, match="at least 2 training vectors"):
            index.train([[1.0, 0.0]])
        with pytest.raises(ValueError, match="must be trained"):
            index.add_vector("a", [1.0, 0.0])

        index.train([[1.0, 0.0], [0.0, 1.0]])
        index.add_vector("a", [1.0, 0.0])
        assert index.search([1.0, 0.0], top_k=1)[0]["id"] == "a"

    def test_batch_add_rejects_mismatched_lengths(self):
        index = FAISSIndexService(dimension=2)
        with pytest.raises(ValueError, match="same length"):
            index.add_vectors(["only-key"], [])

    def test_search_validates_query_and_limit(self):
        index = FAISSIndexService(dimension=2)
        index.add_vector("a", [1.0, 0.0])
        with pytest.raises(ValueError, match="Query dimension"):
            index.search([1.0])
        with pytest.raises(ValueError, match="top_k"):
            index.search([1.0, 0.0], top_k=0)

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

    def test_empty_index_persists_and_loads(self):
        index = FAISSIndexService(dimension=3)

        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = Path(tmpdir) / "empty.index"
            index.save(file_path)
            loaded = FAISSIndexService.load(file_path)

            assert loaded.total_vectors == 0
            assert loaded.search([1.0, 0.0, 0.0]) == []

    def test_load_requires_metadata_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = Path(tmpdir) / "missing.index"
            with pytest.raises(FileNotFoundError, match="FAISS metadata not found"):
                FAISSIndexService.load(file_path)


def make_fake_faiss():
    class FakeIndex:
        def __init__(self, dimension, metric="ip"):
            self.dimension = dimension
            self.metric = metric
            self.vectors = []

        @property
        def ntotal(self):
            return len(self.vectors)

        def train(self, vectors):
            assert len(vectors) >= 2

        def add(self, vectors):
            self.vectors.extend(np.asarray(vectors, dtype=np.float32))

        def search(self, query, count):
            query = np.asarray(query[0], dtype=np.float32)
            if self.metric == "l2":
                scores = np.asarray([np.sum((v - query) ** 2) for v in self.vectors])
                order = np.argsort(scores)[:count]
            else:
                scores = np.asarray([np.dot(v, query) for v in self.vectors])
                order = np.argsort(scores)[::-1][:count]
            return scores[order][None, :], order[None, :]

    class FakeIVF(FakeIndex):
        def __init__(self, quantizer, dimension, nlist, metric):
            super().__init__(dimension, metric="ip")

    return SimpleNamespace(
        IndexFlatIP=lambda dimension: FakeIndex(dimension),
        IndexFlatL2=lambda dimension: FakeIndex(dimension, metric="l2"),
        IndexIVFFlat=FakeIVF,
        METRIC_INNER_PRODUCT=0,
    )
