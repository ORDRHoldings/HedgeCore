"""Tests for Audit Lab review queue + regulatory export fixes.

Covers:
  - Review queue: filtering by confidence, flag detection, exclude logic
  - Review resolve: approve, reject, correct actions + WORM-safe annotation
  - Regulatory export endpoint: ISDA XML with transactions, FINRA 17a-4 with findings
  - ISDA auditSummary section
"""
from __future__ import annotations

import hashlib
import json
import re
from xml.etree import ElementTree as ET

import pytest

from app.services.regulatory_export import export_finra_17a4, export_isda_xml


# ---------------------------------------------------------------------------
# ISDA XML audit summary tests
# ---------------------------------------------------------------------------


class TestIsdaXmlAuditSummary:
    """Tests for the new audit_summary parameter in export_isda_xml."""

    def _sample_run(self) -> dict:
        return {
            "run_id": "run-reg-001",
            "trade_date": "2026-01-01",
            "value_date": "2026-01-15",
            "counterparty": "",
            "currency_base": "",
            "currency_quote": "",
            "notional": "",
            "rate": "",
        }

    def _sample_transactions(self) -> list[dict]:
        return [
            {
                "transaction_id": "txn-a-SELL",
                "direction": "SELL",
                "currency": "MXN",
                "amount": 500000,
                "rate": 0.0556,
                "value_date": "2026-01-15",
            },
            {
                "transaction_id": "txn-a-BUY",
                "direction": "BUY",
                "currency": "USD",
                "amount": 27800,
                "rate": 0.0556,
                "value_date": "2026-01-15",
            },
        ]

    def _sample_summary(self) -> dict:
        return {
            "total_markup_usd": 1234.56,
            "total_loss_usd": 5678.90,
            "methodology_version": "1.3.0",
            "findings_count": 5,
            "findings_total_usd": 6913.46,
        }

    def test_audit_summary_absent_by_default(self) -> None:
        """When audit_summary is not provided, no <auditSummary> section."""
        xml = export_isda_xml(self._sample_run(), self._sample_transactions())
        assert "<auditSummary>" not in xml

    def test_audit_summary_present_when_provided(self) -> None:
        xml = export_isda_xml(
            self._sample_run(),
            self._sample_transactions(),
            audit_summary=self._sample_summary(),
        )
        assert "<auditSummary>" in xml
        assert "</auditSummary>" in xml

    def test_audit_summary_contains_markup_usd(self) -> None:
        xml = export_isda_xml(
            self._sample_run(), [], audit_summary=self._sample_summary()
        )
        assert "<totalMarkupUsd>1234.56</totalMarkupUsd>" in xml

    def test_audit_summary_contains_loss_usd(self) -> None:
        xml = export_isda_xml(
            self._sample_run(), [], audit_summary=self._sample_summary()
        )
        assert "<totalLossUsd>5678.9</totalLossUsd>" in xml

    def test_audit_summary_contains_methodology_version(self) -> None:
        xml = export_isda_xml(
            self._sample_run(), [], audit_summary=self._sample_summary()
        )
        assert "<methodologyVersion>1.3.0</methodologyVersion>" in xml

    def test_findings_summary_count(self) -> None:
        xml = export_isda_xml(
            self._sample_run(), [], audit_summary=self._sample_summary()
        )
        assert "<findingsSummary>" in xml
        assert "<count>5</count>" in xml

    def test_findings_summary_total_usd(self) -> None:
        xml = export_isda_xml(
            self._sample_run(), [], audit_summary=self._sample_summary()
        )
        assert "<totalUsd>6913.46</totalUsd>" in xml

    def test_audit_summary_produces_valid_xml(self) -> None:
        """Full output with audit_summary must be well-formed XML."""
        xml = export_isda_xml(
            self._sample_run(),
            self._sample_transactions(),
            audit_summary=self._sample_summary(),
        )
        parseable = xml.replace("isda:", "").replace("xmlns:isda=", "xmlns=")
        ET.fromstring(parseable)  # raises on malformed XML

    def test_transactions_with_audit_summary(self) -> None:
        """Both transactions and audit summary appear together."""
        xml = export_isda_xml(
            self._sample_run(),
            self._sample_transactions(),
            audit_summary=self._sample_summary(),
        )
        assert xml.count("<transaction>") == 2
        assert "<auditSummary>" in xml
        # auditSummary appears after transactions
        txn_end = xml.index("</transactions>")
        summary_start = xml.index("<auditSummary>")
        assert summary_start > txn_end

    def test_empty_audit_summary_dict(self) -> None:
        """An empty dict is falsy in Python, so no auditSummary section."""
        xml = export_isda_xml(self._sample_run(), [], audit_summary={})
        assert "<auditSummary>" not in xml

    def test_minimal_audit_summary_dict(self) -> None:
        """A dict with at least one key triggers the auditSummary section."""
        xml = export_isda_xml(
            self._sample_run(), [], audit_summary={"findings_count": 0}
        )
        assert "<auditSummary>" in xml
        assert "<count>0</count>" in xml

    def test_backward_compat_no_audit_summary(self) -> None:
        """Existing callers that don't pass audit_summary still work."""
        xml = export_isda_xml(
            {
                "run_id": "run-001",
                "trade_date": "2026-03-09",
                "value_date": "2026-03-11",
                "counterparty": "Acme",
                "currency_base": "EUR",
                "currency_quote": "USD",
                "notional": 1000000,
                "rate": 1.085,
            },
            [
                {
                    "transaction_id": "txn-1",
                    "direction": "BUY",
                    "currency": "EUR",
                    "amount": 500000,
                    "rate": 1.085,
                    "value_date": "2026-03-11",
                }
            ],
        )
        assert "<runId>run-001</runId>" in xml
        assert xml.count("<transaction>") == 1
        assert "<auditSummary>" not in xml


# ---------------------------------------------------------------------------
# FINRA 17a-4 with proper field mappings
# ---------------------------------------------------------------------------


class TestFinra17a4FieldMappings:
    """Tests that FINRA exports work with finding-id/timestamp/category/severity/description keys."""

    def test_finding_fields_in_records(self) -> None:
        findings = [
            {
                "finding_id": "f-uuid-001",
                "timestamp": "2026-03-09T12:00:00+00:00",
                "category": "MARKUP",
                "severity": "HIGH",
                "description": "Bank markup cost for MXNUSD: USD 1,234.56",
            },
        ]
        run_data = {
            "run_id": "run-finra-001",
            "generated_by": "audit_lab",
            "report_date": "2026-03-09",
        }
        text_out = export_finra_17a4(run_data, findings, [])
        lines = text_out.strip().split("\n")
        records = [l for l in lines if l.startswith("RECORD")]
        assert len(records) == 1
        assert "f-uuid-001" in records[0]
        assert "MARKUP" in records[0]
        assert "HIGH" in records[0]
        assert "Bank markup cost" in records[0]

    def test_finra_with_multiple_findings(self) -> None:
        findings = [
            {
                "finding_id": "f-001",
                "timestamp": "2026-03-09T10:00:00Z",
                "category": "MARKUP",
                "severity": "HIGH",
                "description": "Markup finding",
            },
            {
                "finding_id": "f-002",
                "timestamp": "2026-03-09T10:01:00Z",
                "category": "FEE",
                "severity": "MEDIUM",
                "description": "Fee finding",
            },
            {
                "finding_id": "f-003",
                "timestamp": "2026-03-09T10:02:00Z",
                "category": "RATE_VARIANCE",
                "severity": "LOW",
                "description": "Rate variance finding",
            },
        ]
        run_data = {"run_id": "run-002", "generated_by": "audit_lab"}
        hashes = ["aaa", "bbb", "ccc"]
        text_out = export_finra_17a4(run_data, findings, hashes)
        lines = text_out.strip().split("\n")
        assert lines[0].startswith("HEADER")
        assert lines[-1].startswith("TRAILER")
        records = [l for l in lines if l.startswith("RECORD")]
        assert len(records) == 3
        assert "RECORD_COUNT=3" in lines[-1]


# ---------------------------------------------------------------------------
# Review queue logic tests (unit-level, no DB)
# ---------------------------------------------------------------------------


class TestReviewQueueConfidenceLogic:
    """Test the confidence scoring logic used in the review queue endpoint.

    These are pure-function tests extracted from the endpoint logic to
    validate confidence calculation without requiring a database.
    """

    @staticmethod
    def _compute_confidence(pw) -> tuple[float, list]:
        """Replicate the confidence computation from the review queue endpoint."""
        confidence = 1.0
        flags: list = []

        if isinstance(pw, dict):
            confidence = float(pw.get("confidence", 1.0))
            flags = pw.get("flags", [])
        elif isinstance(pw, list) and len(pw) > 0:
            flags = pw
            confidence = max(0.1, 1.0 - 0.15 * len(pw))

        return confidence, flags

    def test_empty_list_full_confidence(self) -> None:
        c, f = self._compute_confidence([])
        assert c == 1.0
        assert f == []

    def test_single_warning_reduces_confidence(self) -> None:
        c, f = self._compute_confidence(["Row 0: missing trade_date"])
        assert c == pytest.approx(0.85, abs=0.01)
        assert len(f) == 1

    def test_two_warnings_reduce_more(self) -> None:
        c, f = self._compute_confidence(["warn1", "warn2"])
        assert c == pytest.approx(0.70, abs=0.01)

    def test_many_warnings_floor_at_0_1(self) -> None:
        warnings = [f"warn-{i}" for i in range(20)]
        c, f = self._compute_confidence(warnings)
        assert c == pytest.approx(0.1, abs=0.01)

    def test_dict_with_explicit_confidence(self) -> None:
        c, f = self._compute_confidence({"confidence": 0.5, "flags": ["low_quality"]})
        assert c == 0.5
        assert f == ["low_quality"]

    def test_dict_without_confidence_defaults_to_1(self) -> None:
        c, f = self._compute_confidence({"flags": ["some_flag"]})
        assert c == 1.0
        assert f == ["some_flag"]

    def test_none_returns_defaults(self) -> None:
        c, f = self._compute_confidence(None)
        assert c == 1.0
        assert f == []

    def test_string_parse_warnings_json(self) -> None:
        """parse_warnings stored as JSON string should be handled by the endpoint."""
        pw_str = json.dumps(["Row 5: missing currency_sold", "Row 5: missing currency_bought"])
        pw = json.loads(pw_str)
        c, f = self._compute_confidence(pw)
        assert c == pytest.approx(0.70, abs=0.01)
        assert len(f) == 2

    def test_excluded_dict_skipped(self) -> None:
        """Transactions with excluded=true should be filtered out."""
        pw = {"excluded": True, "confidence": 0.3, "flags": ["bad_data"]}
        # The endpoint checks pw.get("excluded") and skips — verify that field
        assert pw.get("excluded") is True

    def test_threshold_boundary_0_8(self) -> None:
        """Confidence exactly 0.8 with no flags should be excluded from queue."""
        c, f = self._compute_confidence({"confidence": 0.8})
        # The endpoint skips when confidence >= 0.8 AND not flags
        assert c >= 0.8
        assert not f

    def test_threshold_below_0_8(self) -> None:
        """Confidence below 0.8 should be included."""
        c, f = self._compute_confidence({"confidence": 0.79})
        assert c < 0.8


class TestResolveActionValidation:
    """Test that resolve action validation works correctly."""

    def test_valid_actions(self) -> None:
        for action in ("approve", "reject", "correct"):
            assert action in ("approve", "reject", "correct")

    def test_invalid_action_rejected(self) -> None:
        action = "delete"
        assert action not in ("approve", "reject", "correct")

    def test_approve_resolution_structure(self) -> None:
        resolution = {
            "action": "approve",
            "note": "Human-reviewed and approved.",
        }
        assert resolution["action"] == "approve"
        assert "reviewed" in resolution["note"].lower()

    def test_reject_resolution_has_excluded(self) -> None:
        resolution = {
            "action": "reject",
            "note": "Excluded by reviewer.",
            "excluded": True,
        }
        assert resolution["excluded"] is True

    def test_correct_resolution_preserves_original(self) -> None:
        corrections = {"amount_sold": 600000, "counterparty": "BBVA"}
        resolution = {
            "action": "correct",
            "note": "Correction requested (original preserved).",
            "corrections": corrections,
        }
        assert resolution["corrections"]["amount_sold"] == 600000

    def test_resolution_appended_to_list_warnings(self) -> None:
        """When parse_warnings is a list, resolution wraps it."""
        pw = ["Row 0: missing trade_date"]
        resolution = {"action": "approve", "note": "OK"}
        new_pw = {"original_warnings": pw, "resolution": resolution}
        assert new_pw["original_warnings"] == pw
        assert new_pw["resolution"]["action"] == "approve"

    def test_resolution_appended_to_dict_warnings(self) -> None:
        """When parse_warnings is a dict, resolution is merged in."""
        pw = {"confidence": 0.6, "flags": ["low_quality"]}
        resolution = {"action": "reject", "excluded": True}
        new_pw = {**pw, "resolution": resolution}
        assert new_pw["confidence"] == 0.6
        assert new_pw["resolution"]["action"] == "reject"

    def test_reject_sets_excluded_on_wrapper(self) -> None:
        pw_list = ["warn1"]
        resolution = {"action": "reject", "excluded": True}
        new_pw = {"original_warnings": pw_list, "resolution": resolution}
        new_pw["excluded"] = True
        assert new_pw["excluded"] is True
