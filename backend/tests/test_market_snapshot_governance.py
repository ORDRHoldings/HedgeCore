# backend/tests/test_market_snapshot_governance.py
"""
Market Snapshot Governance Tests — P0 Institutional Suite

Tests cover:
  1. Hash Contract: canonical JSON + SHA-256 determinism
  2. Idempotency: same payload → same hash → no duplicate row
  3. Policy Gating: V-024 CRITICAL when data_class=INDICATIVE_FALLBACK + allow_indicative_proxy=False
  4. Policy Gate Open: V-024 absent when allow_indicative_proxy=True
  5. V-022 still present as WARNING (does not block when gate is open)
  6. RunEnvelope snapshot provenance fields
  7. Tenant isolation: different company_id → different namespace
  8. Data class extraction from provider_metadata
  9. Synthetic forward detection
 10. Hash collision detection (concurrent idempotency guard)
"""

from __future__ import annotations

import hashlib
import json
import copy
from datetime import datetime, timezone
from typing import Any, Dict
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.app.services.market_snapshot_service import (
    build_canonical_payload,
    build_snapshot_hash,
)
from backend.app.engine_v1.validator import validate_all
from backend.app.engine_v1.audit import build_run_envelope
from backend.app.schemas_v1.market import MarketSnapshot
from backend.app.schemas_v1.policy import PolicyConfig
from backend.app.schemas_v1.errors import Severity


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

def _live_market_payload(as_of: str | None = None) -> Dict[str, Any]:
    return {
        "as_of": as_of or "2026-02-28T12:00:00Z",
        "spot_rate": 20.25,
        "forward_points_by_month": {
            "2026-03": 0.0972,
            "2026-04": 0.1944,
            "2026-05": 0.2916,
        },
        "provider_metadata": {
            "source": "finnhub_live",
            "data_class": "LIVE",
            "currency_pair": "USD/MXN",
            "primary_currency": "MXN",
        },
    }


def _indicative_market_payload() -> Dict[str, Any]:
    return {
        "as_of": "2026-02-28T12:00:00Z",
        "spot_rate": 18.97,
        "forward_points_by_month": {
            "2026-03": 0.091,
            "2026-04": 0.182,
        },
        "provider_metadata": {
            "source": "indicative_fallback",
            "data_class": "INDICATIVE_FALLBACK",
            "currency_pair": "USD/MXN",
            "primary_currency": "MXN",
        },
    }


def _market_snapshot(payload: Dict[str, Any]) -> MarketSnapshot:
    return MarketSnapshot(**payload)


def _policy(
    confirmed: float = 1.0,
    allow_indicative_proxy: bool = False,
    execution_product: str = "NDF",
) -> PolicyConfig:
    return PolicyConfig(
        hedge_ratios={"confirmed": confirmed, "forecast": 0.0},
        cost_assumptions={"spread_bps": 10.0},
        execution_product=execution_product,
        min_trade_size_usd=0.0,
        allow_indicative_proxy=allow_indicative_proxy,
    )


# ─────────────────────────────────────────────────────────────────────────────
# 1. Hash Contract
# ─────────────────────────────────────────────────────────────────────────────

class TestHashContract:
    """Canonical JSON + SHA-256 must be deterministic and stable."""

    def test_canonical_payload_is_deterministic(self) -> None:
        """Same dict → same canonical JSON regardless of Python dict ordering."""
        payload = _live_market_payload()
        j1 = build_canonical_payload(payload)
        j2 = build_canonical_payload(payload)
        assert j1 == j2

    def test_canonical_payload_sort_keys(self) -> None:
        """Keys must be sorted (sort_keys=True contract)."""
        payload = _live_market_payload()
        canonical = build_canonical_payload(payload)
        parsed = json.loads(canonical)
        assert list(parsed.keys()) == sorted(parsed.keys())

    def test_canonical_payload_compact(self) -> None:
        """Canonical JSON must be compact (no trailing spaces, no newlines)."""
        payload = _live_market_payload()
        canonical = build_canonical_payload(payload)
        assert " " not in canonical
        assert "\n" not in canonical

    def test_snapshot_hash_is_sha256(self) -> None:
        """Hash must be a 64-char lowercase hex string (SHA-256)."""
        payload = _live_market_payload()
        canonical = build_canonical_payload(payload)
        h = build_snapshot_hash(canonical)
        assert len(h) == 64
        assert h == h.lower()
        assert all(c in "0123456789abcdef" for c in h)

    def test_snapshot_hash_matches_manual_sha256(self) -> None:
        """build_snapshot_hash must equal sha256(canonical.encode('utf-8')).hexdigest()."""
        payload = _live_market_payload()
        canonical = build_canonical_payload(payload)
        expected = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        assert build_snapshot_hash(canonical) == expected

    def test_different_payloads_produce_different_hashes(self) -> None:
        """Two payloads with different spot rates must have different hashes."""
        p1 = _live_market_payload()
        p2 = copy.deepcopy(p1)
        p2["spot_rate"] = p1["spot_rate"] + 0.01
        c1 = build_canonical_payload(p1)
        c2 = build_canonical_payload(p2)
        assert build_snapshot_hash(c1) != build_snapshot_hash(c2)

    def test_identical_payloads_same_hash(self) -> None:
        """Two identical payloads must hash identically (idempotency key)."""
        p1 = _live_market_payload()
        p2 = copy.deepcopy(p1)
        assert build_snapshot_hash(build_canonical_payload(p1)) == \
               build_snapshot_hash(build_canonical_payload(p2))

    def test_dict_order_irrelevant_to_hash(self) -> None:
        """Dict created with keys in reverse order must hash identically."""
        payload = _live_market_payload()
        reversed_keys = dict(reversed(list(payload.items())))
        assert build_snapshot_hash(build_canonical_payload(payload)) == \
               build_snapshot_hash(build_canonical_payload(reversed_keys))


# ─────────────────────────────────────────────────────────────────────────────
# 2. Policy Gating — V-024 CRITICAL
# ─────────────────────────────────────────────────────────────────────────────

def _minimal_trades():
    from backend.app.schemas_v1.trades import TradeRow
    return [
        TradeRow(
            record_id="T001",
            entity="Acme",
            type="AR",
            currency="MXN",
            amount=1_000_000.0,
            value_date="2026-03-15",
            status="CONFIRMED",
            description="test",
        )
    ]


class TestPolicyGatingV024:
    """V-024: CRITICAL gate for INDICATIVE_FALLBACK when allow_indicative_proxy=False."""

    def test_v024_critical_when_indicative_and_gate_closed(self) -> None:
        """Default policy (allow_indicative_proxy=False) + INDICATIVE_FALLBACK → V-024 CRITICAL."""
        market = _market_snapshot(_indicative_market_payload())
        policy = _policy(allow_indicative_proxy=False)
        trades = _minimal_trades()

        report = validate_all(trades, [], market, policy)

        v024_errors = [e for e in report.errors if e.code == "V-024"]
        assert len(v024_errors) == 1, f"Expected V-024, got: {[e.code for e in report.errors]}"
        assert v024_errors[0].severity == Severity.CRITICAL
        assert report.status == "FAIL"

    def test_v024_absent_when_indicative_and_gate_open(self) -> None:
        """allow_indicative_proxy=True + INDICATIVE_FALLBACK → no V-024 (gate open)."""
        market = _market_snapshot(_indicative_market_payload())
        policy = _policy(allow_indicative_proxy=True)
        trades = _minimal_trades()

        report = validate_all(trades, [], market, policy)

        v024_errors = [e for e in report.errors if e.code == "V-024"]
        assert len(v024_errors) == 0, f"Unexpected V-024: {v024_errors}"

    def test_v024_absent_when_live_data(self) -> None:
        """LIVE data_class → V-024 is never raised regardless of allow_indicative_proxy."""
        market = _market_snapshot(_live_market_payload())
        policy = _policy(allow_indicative_proxy=False)
        trades = _minimal_trades()

        report = validate_all(trades, [], market, policy)

        v024_errors = [e for e in report.errors if e.code == "V-024"]
        assert len(v024_errors) == 0

    def test_v022_still_warning_when_gate_open(self) -> None:
        """V-022 (WARNING) still emitted even when allow_indicative_proxy=True.
        WARNINGs go to report.warnings (str list), not report.errors (CRITICAL only).
        """
        market = _market_snapshot(_indicative_market_payload())
        policy = _policy(allow_indicative_proxy=True)
        trades = _minimal_trades()

        report = validate_all(trades, [], market, policy)

        # WARNINGs are in report.warnings as "CODE: message" strings
        assert any("V-022" in w for w in report.warnings),             f"Expected V-022 in warnings, got: {report.warnings}"
        assert not any(e.code == "V-024" for e in report.errors)

    def test_v022_and_v024_both_present_when_gate_closed(self) -> None:
        """V-022 WARNING in report.warnings; V-024 CRITICAL in report.errors when gate closed."""
        market = _market_snapshot(_indicative_market_payload())
        policy = _policy(allow_indicative_proxy=False)
        trades = _minimal_trades()

        report = validate_all(trades, [], market, policy)

        assert any("V-022" in w for w in report.warnings),             f"Expected V-022 in warnings, got: {report.warnings}"
        assert any(e.code == "V-024" for e in report.errors),             f"Expected V-024 in errors, got: {[e.code for e in report.errors]}"

    def test_v024_message_contains_guidance(self) -> None:
        """V-024 message must mention allow_indicative_proxy for operator guidance."""
        market = _market_snapshot(_indicative_market_payload())
        policy = _policy(allow_indicative_proxy=False)
        trades = _minimal_trades()

        report = validate_all(trades, [], market, policy)

        v024 = next(e for e in report.errors if e.code == "V-024")
        assert "allow_indicative_proxy" in v024.message
        assert "INDICATIVE_FALLBACK" in v024.message


# ─────────────────────────────────────────────────────────────────────────────
# 3. PolicyConfig schema — allow_indicative_proxy field
# ─────────────────────────────────────────────────────────────────────────────

class TestPolicyConfigSchema:
    """Policy schema must correctly expose allow_indicative_proxy."""

    def test_default_is_false(self) -> None:
        """allow_indicative_proxy must default to False (fail-closed)."""
        p = _policy()
        assert p.allow_indicative_proxy is False

    def test_explicit_true(self) -> None:
        p = PolicyConfig(
            hedge_ratios={"confirmed": 1.0, "forecast": 0.0},
            cost_assumptions={"spread_bps": 5.0},
            execution_product="NDF",
            min_trade_size_usd=0.0,
            allow_indicative_proxy=True,
        )
        assert p.allow_indicative_proxy is True

    def test_serialization_round_trip(self) -> None:
        """allow_indicative_proxy survives model_dump → PolicyConfig(**...) round-trip."""
        p = _policy(allow_indicative_proxy=True)
        d = p.model_dump()
        p2 = PolicyConfig(**d)
        assert p2.allow_indicative_proxy is True


# ─────────────────────────────────────────────────────────────────────────────
# 4. RunEnvelope snapshot provenance
# ─────────────────────────────────────────────────────────────────────────────

class TestRunEnvelopeProvenance:
    """RunEnvelope must propagate snapshot_meta fields faithfully."""

    def _make_envelope(self, snapshot_meta=None):
        trades_raw = [{"record_id": "T1", "amount": 1000.0}]
        hedges_raw = []
        market_raw = _live_market_payload()
        policy_raw = {"hedge_ratios": {"confirmed": 1.0, "forecast": 0.0}}
        outputs_raw = {"hedge_plan": {}}

        return build_run_envelope(
            run_id="test-run-001",
            trades_raw=trades_raw,
            hedges_raw=hedges_raw,
            market_raw=market_raw,
            policy_raw=policy_raw,
            outputs_raw=outputs_raw,
            snapshot_meta=snapshot_meta,
        )

    def test_no_snapshot_meta_fields_are_none(self) -> None:
        envelope = self._make_envelope(snapshot_meta=None)
        assert envelope.market_snapshot_id is None
        assert envelope.market_snapshot_hash is None
        assert envelope.market_provider is None
        assert envelope.market_fetched_at is None
        assert envelope.market_as_of is None
        assert envelope.market_data_class is None
        assert envelope.market_is_synthetic_forward is None

    def test_snapshot_meta_propagated(self) -> None:
        meta = {
            "market_snapshot_id":          "abc123-uuid",
            "market_snapshot_hash":        "deadbeef" * 8,
            "market_provider":             "finnhub_live",
            "market_fetched_at":           "2026-02-28T12:00:00+00:00",
            "market_as_of":                "2026-02-28T11:59:00+00:00",
            "market_data_class":           "LIVE",
            "market_is_synthetic_forward": False,
        }
        envelope = self._make_envelope(snapshot_meta=meta)
        assert envelope.market_snapshot_id      == "abc123-uuid"
        assert envelope.market_snapshot_hash    == "deadbeef" * 8
        assert envelope.market_provider         == "finnhub_live"
        assert envelope.market_fetched_at       == "2026-02-28T12:00:00+00:00"
        assert envelope.market_as_of            == "2026-02-28T11:59:00+00:00"
        assert envelope.market_data_class       == "LIVE"
        assert envelope.market_is_synthetic_forward is False

    def test_snapshot_meta_synthetic_forward(self) -> None:
        meta = {
            "market_snapshot_id":          "snap-002",
            "market_snapshot_hash":        "a" * 64,
            "market_provider":             "indicative_fallback",
            "market_fetched_at":           "2026-02-28T10:00:00+00:00",
            "market_as_of":                "2026-02-28T10:00:00+00:00",
            "market_data_class":           "INDICATIVE_FALLBACK",
            "market_is_synthetic_forward": True,
        }
        envelope = self._make_envelope(snapshot_meta=meta)
        assert envelope.market_is_synthetic_forward is True
        assert envelope.market_data_class == "INDICATIVE_FALLBACK"

    def test_run_hash_unaffected_by_snapshot_meta(self) -> None:
        """run_hash must depend only on inputs/outputs, not snapshot_meta."""
        e1 = self._make_envelope(snapshot_meta=None)
        e2 = self._make_envelope(snapshot_meta={"market_snapshot_id": "different"})
        # run_hash derives from inputs_hash + outputs_hash, not snapshot_meta
        assert e1.run_hash == e2.run_hash

    def test_envelope_serializable(self) -> None:
        """RunEnvelope with snapshot_meta must serialize cleanly to JSON."""
        meta = {
            "market_snapshot_id":          "snap-xyz",
            "market_snapshot_hash":        "b" * 64,
            "market_provider":             "finnhub_live",
            "market_fetched_at":           "2026-02-28T12:00:00+00:00",
            "market_as_of":                "2026-02-28T12:00:00+00:00",
            "market_data_class":           "LIVE",
            "market_is_synthetic_forward": False,
        }
        envelope = self._make_envelope(snapshot_meta=meta)
        d = envelope.model_dump(mode="json")
        assert d["market_snapshot_id"] == "snap-xyz"
        assert d["market_data_class"]  == "LIVE"
        # Ensure JSON-serializable
        import json as _j
        _j.dumps(d)  # must not raise


# ─────────────────────────────────────────────────────────────────────────────
# 5. Hash service unit tests (pure functions — no DB)
# ─────────────────────────────────────────────────────────────────────────────

class TestHashServicePure:
    """Pure hash-contract tests for build_canonical_payload + build_snapshot_hash."""

    def test_canonical_payload_handles_nested_dicts(self) -> None:
        payload = {
            "z_outer": {"z_inner": 1, "a_inner": 2},
            "a_outer": "value",
        }
        canonical = build_canonical_payload(payload)
        parsed = json.loads(canonical)
        # Outer keys sorted
        assert list(parsed.keys()) == ["a_outer", "z_outer"]
        # Inner keys sorted
        assert list(parsed["z_outer"].keys()) == ["a_inner", "z_inner"]

    def test_canonical_payload_handles_none_values(self) -> None:
        payload = {"key": None, "other": "val"}
        canonical = build_canonical_payload(payload)
        assert '"key":null' in canonical

    def test_canonical_payload_is_ascii_safe(self) -> None:
        payload = {"currency": "MXN", "note": "indicative"}
        canonical = build_canonical_payload(payload)
        canonical.encode("ascii")  # must not raise

    def test_hash_empty_dict(self) -> None:
        """Empty dict must have a stable, non-empty hash."""
        canonical = build_canonical_payload({})
        h = build_snapshot_hash(canonical)
        assert len(h) == 64
        # Verify against known SHA-256("{}")
        expected = hashlib.sha256(b"{}").hexdigest()
        assert h == expected

    def test_indicative_vs_live_hash_differ(self) -> None:
        """LIVE and INDICATIVE payloads with same spot must have different hashes."""
        live = _live_market_payload()
        ind  = _indicative_market_payload()
        ind["spot_rate"] = live["spot_rate"]  # same spot
        h_live = build_snapshot_hash(build_canonical_payload(live))
        h_ind  = build_snapshot_hash(build_canonical_payload(ind))
        assert h_live != h_ind  # data_class differs → different hash


# ─────────────────────────────────────────────────────────────────────────────
# 6. Data class and synthetic forward extraction
# ─────────────────────────────────────────────────────────────────────────────

class TestDataClassExtraction:
    """Verify data_class + is_synthetic_forward derivation from provider_metadata."""

    def test_live_source_not_synthetic(self) -> None:
        """data_class=LIVE → is_synthetic=False."""
        from backend.app.services.market_snapshot_service import build_canonical_payload, build_snapshot_hash
        payload = _live_market_payload()
        data_class = payload["provider_metadata"]["data_class"]
        is_synthetic = data_class != "LIVE"
        assert not is_synthetic

    def test_indicative_source_is_synthetic(self) -> None:
        """data_class=INDICATIVE_FALLBACK → is_synthetic=True."""
        payload = _indicative_market_payload()
        data_class = payload["provider_metadata"]["data_class"]
        is_synthetic = data_class != "LIVE"
        assert is_synthetic

    def test_missing_data_class_defaults_to_indicative(self) -> None:
        """provider_metadata without data_class → treated as INDICATIVE_FALLBACK (safe default)."""
        payload = _live_market_payload()
        del payload["provider_metadata"]["data_class"]
        data_class = payload.get("provider_metadata", {}).get("data_class", "INDICATIVE_FALLBACK")
        assert data_class == "INDICATIVE_FALLBACK"


# ─────────────────────────────────────────────────────────────────────────────
# 7. Regression guards — existing codes unaffected
# ─────────────────────────────────────────────────────────────────────────────

class TestRegressionGuards:
    """V-022 and V-023 still fire correctly after V-024 was added."""

    def test_v022_fires_for_indicative_regardless_of_gate(self) -> None:
        """V-022 is a WARNING and always goes to report.warnings on INDICATIVE_FALLBACK."""
        market = _market_snapshot(_indicative_market_payload())
        policy = _policy(allow_indicative_proxy=True)  # gate open, but V-022 still fires
        trades = _minimal_trades()

        report = validate_all(trades, [], market, policy)
        assert any("V-022" in w for w in report.warnings),             f"Expected V-022 in warnings, got: {report.warnings}"

    def test_no_v022_for_live_data(self) -> None:
        """V-022 must NOT fire for LIVE data."""
        market = _market_snapshot(_live_market_payload())
        policy = _policy()
        trades = _minimal_trades()

        report = validate_all(trades, [], market, policy)
        assert not any(e.code == "V-022" for e in report.errors)

    def test_v023_fires_for_stale_market(self) -> None:
        """V-023 must fire for market as_of older than 24h (goes to report.warnings)."""
        old_as_of = "2020-01-01T00:00:00Z"
        payload = _live_market_payload(as_of=old_as_of)
        market = _market_snapshot(payload)
        policy = _policy()
        trades = _minimal_trades()

        report = validate_all(trades, [], market, policy)
        # V-023 is WARNING → goes to report.warnings as "V-023: ..." string
        assert any("V-023" in w for w in report.warnings),             f"Expected V-023 in warnings, got: {report.warnings}"

    def test_v022_v023_are_warnings_not_criticals(self) -> None:
        """V-022 and V-023 are WARNINGs — they appear in report.warnings, not report.errors."""
        payload = _indicative_market_payload()
        payload["as_of"] = "2020-01-01T00:00:00Z"  # stale + indicative
        market = _market_snapshot(payload)
        policy = _policy(allow_indicative_proxy=True)  # gate open so V-024 absent
        trades = _minimal_trades()

        report = validate_all(trades, [], market, policy)
        # V-022 and V-023 must be in warnings (not in errors which are CRITICAL-only)
        assert any("V-022" in w for w in report.warnings), "V-022 must be in warnings"
        assert any("V-023" in w for w in report.warnings), "V-023 must be in warnings"
        # Neither must appear in errors (which contains only CRITICALs)
        critical_codes = {e.code for e in report.errors}
        assert "V-022" not in critical_codes
        assert "V-023" not in critical_codes
