"""Tests for app.engine_v1.scenarios_multi."""

import pytest

from app.engine_v1.scenarios_multi import SIGMAS, compute_scenarios_multi
from app.schemas_v1.results import (
    GenericBucketResult,
    ScenarioBucketResult,
    ScenarioResults,
    ScenarioTotalResult,
)


def _make_bucket(
    bucket="2025-07",
    pair="USDMXN",
    commercial_exposure_local=10_000_000.0,
    hedge_position_local=-8_000_000.0,
    residual_local=-2_000_000.0,
    forward_rate=17.475,
) -> GenericBucketResult:
    return GenericBucketResult(
        bucket=bucket,
        pair=pair,
        local_ccy=pair[3:] if pair.startswith("USD") else pair[:3],
        confirmed_flow_local=commercial_exposure_local,
        forecast_flow_local=0.0,
        commercial_exposure_local=commercial_exposure_local,
        existing_hedges_local=hedge_position_local,
        target_signed_local=hedge_position_local,
        action_local=0.0,
        action_direction=None,
        forward_rate=forward_rate,
        carry_note="",
        action_usd=0.0,
        friction_usd=0.0,
        suppressed=False,
        hedge_position_local=hedge_position_local,
        residual_local=residual_local,
    )


class TestSigmasConstant:
    def test_sigmas_values(self):
        assert SIGMAS == [-0.10, -0.05, 0.05, 0.10]

    def test_sigmas_length(self):
        assert len(SIGMAS) == 4

    def test_sigmas_symmetric(self):
        assert SIGMAS[0] == -SIGMAS[3]
        assert SIGMAS[1] == -SIGMAS[2]


class TestComputeScenariosMulti:
    def test_basic_single_bucket(self):
        buckets = [_make_bucket()]
        result = compute_scenarios_multi(buckets, spot=17.15, pair="USDMXN")
        assert isinstance(result, ScenarioResults)
        assert result.sigmas == SIGMAS
        assert len(result.per_bucket) == len(SIGMAS)
        assert len(result.totals) == len(SIGMAS)

    def test_shocked_spots_correct(self):
        buckets = [_make_bucket()]
        result = compute_scenarios_multi(buckets, spot=17.15, pair="USDMXN")
        for total in result.totals:
            expected = 17.15 * (1 + total.sigma)
            assert total.shocked_spot == pytest.approx(expected, abs=1e-8)

    def test_totals_aggregate_over_buckets(self):
        b1 = _make_bucket(bucket="2025-07")
        b2 = _make_bucket(bucket="2025-08")
        result = compute_scenarios_multi([b1, b2], spot=17.15, pair="USDMXN")
        assert len(result.per_bucket) == 8
        assert len(result.totals) == 4

    def test_per_bucket_result_fields(self):
        buckets = [_make_bucket()]
        result = compute_scenarios_multi(buckets, spot=17.15, pair="USDMXN")
        for pb in result.per_bucket:
            assert isinstance(pb, ScenarioBucketResult)
            assert pb.bucket == "2025-07"
            assert pb.sigma in SIGMAS

    def test_hedge_benefit_nonzero_when_hedged(self):
        bucket = _make_bucket(
            commercial_exposure_local=-10_000_000,
            hedge_position_local=8_000_000,
            residual_local=-2_000_000,
            forward_rate=17.475,
        )
        result = compute_scenarios_multi([bucket], spot=17.15, pair="USDMXN")
        benefits = [pb.hedge_benefit_usd for pb in result.per_bucket]
        assert any(b != 0.0 for b in benefits)

    def test_empty_buckets(self):
        result = compute_scenarios_multi([], spot=17.15, pair="USDMXN")
        assert len(result.per_bucket) == 0
        assert len(result.totals) == 4
        for total in result.totals:
            assert total.total_unhedged_usd == 0.0
            assert total.total_hedged_usd == 0.0
            assert total.total_hedge_benefit_usd == 0.0

    def test_zero_spot(self):
        bucket = _make_bucket()
        result = compute_scenarios_multi([bucket], spot=0.0, pair="USDMXN")
        assert isinstance(result, ScenarioResults)

    def test_eurusd_pair(self):
        bucket = _make_bucket(
            pair="EURUSD",
            commercial_exposure_local=500_000,
            hedge_position_local=-400_000,
            residual_local=-100_000,
            forward_rate=1.082,
        )
        result = compute_scenarios_multi([bucket], spot=1.085, pair="EURUSD")
        assert len(result.per_bucket) == 4
        assert len(result.totals) == 4

    def test_totals_sum_matches_per_bucket(self):
        b1 = _make_bucket(bucket="2025-07", commercial_exposure_local=5_000_000)
        b2 = _make_bucket(bucket="2025-08", commercial_exposure_local=3_000_000)
        result = compute_scenarios_multi([b1, b2], spot=17.15, pair="USDMXN")
        for sigma in SIGMAS:
            total = next(t for t in result.totals if t.sigma == sigma)
            bucket_sum_unhedged = sum(
                pb.unhedged_usd for pb in result.per_bucket if pb.sigma == sigma
            )
            bucket_sum_hedged = sum(
                pb.hedged_usd for pb in result.per_bucket if pb.sigma == sigma
            )
            assert total.total_unhedged_usd == pytest.approx(bucket_sum_unhedged, abs=1e-6)
            assert total.total_hedged_usd == pytest.approx(bucket_sum_hedged, abs=1e-6)

    def test_unhedged_equals_hedged_when_zero_hedge(self):
        bucket = _make_bucket(
            commercial_exposure_local=10_000_000,
            hedge_position_local=0,
            residual_local=10_000_000,
            forward_rate=17.475,
        )
        result = compute_scenarios_multi([bucket], spot=17.15, pair="USDMXN")
        for pb in result.per_bucket:
            assert pb.hedged_usd == pytest.approx(pb.unhedged_usd, abs=1e-4)
            assert pb.hedge_benefit_usd == pytest.approx(0.0, abs=1e-4)

    def test_zero_exposure_zero_values(self):
        b = _make_bucket(
            commercial_exposure_local=0.0,
            hedge_position_local=0.0,
            residual_local=0.0,
        )
        result = compute_scenarios_multi([b], spot=17.15, pair="USDMXN")
        for t in result.totals:
            assert t.total_unhedged_usd == pytest.approx(0.0)
            assert t.total_hedged_usd == pytest.approx(0.0)

    def test_per_bucket_sigma_field_complete(self):
        result = compute_scenarios_multi([_make_bucket()], spot=17.15, pair="USDMXN")
        sigmas_in_result = sorted(set(pb.sigma for pb in result.per_bucket))
        assert sigmas_in_result == sorted(SIGMAS)

    def test_per_bucket_bucket_field(self):
        result = compute_scenarios_multi(
            [_make_bucket(bucket="2026-09")], spot=17.15, pair="USDMXN"
        )
        for pb in result.per_bucket:
            assert pb.bucket == "2026-09"

    def test_shocked_spot_negative_sigma(self):
        result = compute_scenarios_multi([_make_bucket()], spot=100.0, pair="USDMXN")
        t = next(t for t in result.totals if t.sigma == -0.10)
        assert t.shocked_spot == pytest.approx(90.0)

    def test_shocked_spot_positive_sigma(self):
        result = compute_scenarios_multi([_make_bucket()], spot=100.0, pair="USDMXN")
        t = next(t for t in result.totals if t.sigma == 0.10)
        assert t.shocked_spot == pytest.approx(110.0)

    def test_three_buckets(self):
        buckets = [
            _make_bucket(bucket="2025-07"),
            _make_bucket(bucket="2025-08"),
            _make_bucket(bucket="2025-09"),
        ]
        result = compute_scenarios_multi(buckets, spot=17.15, pair="USDMXN")
        assert len(result.per_bucket) == 12  # 3 buckets x 4 sigmas
