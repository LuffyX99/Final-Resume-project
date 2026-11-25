"""Database tests for Schema and Migration Models."""

import pytest
from app.database import Base
from app.models import Application, Job, Match, Resume, User


def test_sqlalchemy_relational_models_mapped():
    tables = Base.metadata.tables
    assert "users" in tables
    assert "jobs" in tables
    assert "resumes" in tables
    assert "matches" in tables
    assert "applications" in tables
