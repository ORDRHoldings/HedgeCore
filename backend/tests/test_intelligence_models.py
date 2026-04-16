# backend/tests/test_intelligence_models.py
"""Tests for IntelligenceQueryLog ORM model."""
from __future__ import annotations


class TestIntelligenceQueryLog:
    def test_tablename(self):
        from app.models.intelligence import IntelligenceQueryLog
        assert IntelligenceQueryLog.__tablename__ == "intelligence_query_log"

    def test_columns_present(self):
        from app.models.intelligence import IntelligenceQueryLog
        cols = {c.key for c in IntelligenceQueryLog.__table__.columns}
        expected = {
            "id", "company_id", "user_id", "capability",
            "prompt_hash", "tokens_in", "tokens_out", "latency_ms", "created_at",
        }
        assert expected.issubset(cols)

    def test_capability_max_length(self):
        from app.models.intelligence import IntelligenceQueryLog
        col = IntelligenceQueryLog.__table__.c.capability
        assert col.type.length == 20

    def test_prompt_hash_max_length(self):
        from app.models.intelligence import IntelligenceQueryLog
        col = IntelligenceQueryLog.__table__.c.prompt_hash
        assert col.type.length == 64

    def test_company_id_indexed(self):
        from app.models.intelligence import IntelligenceQueryLog
        col = IntelligenceQueryLog.__table__.c.company_id
        assert col.index is True
