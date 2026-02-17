"""Deterministic scenario catalog for import/export business cases."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Literal

from app.schemas.hedges import HedgeRow
from app.schemas.market import MarketSnapshot
from app.schemas.policy import CostAssumptions, HedgeRatios, PolicyConfig
from app.schemas.trades import TradeRow


@dataclass(frozen=True)
class ExpectedBehavior:
    validation_status: Literal["PASS", "FAIL"]
    expected_error_codes: tuple[str, ...] = ()


@dataclass(frozen=True)
class ScenarioCase:
    id: str
    label: str
    archetype: Literal["IMPORTER", "EXPORTER", "MIXED", "STRESS"]
    trades: list[TradeRow]
    hedges: list[HedgeRow]
    market: MarketSnapshot
    policy: PolicyConfig
    tags: tuple[str, ...]
    expected_behavior: ExpectedBehavior


@dataclass(frozen=True)
class ScenarioOutcome:
    scenario_id: str
    scenario_label: str
    archetype: str
    run_id: str
    validation_status: str
    total_commercial_exposure_mxn: float | None
    total_existing_hedges_mxn: float | None
    total_action_mxn: float | None
    total_friction_usd: float | None
    total_residual_mxn: float | None
    coverage_ratio: float | None
    worst_case_benefit_usd: float | None
    best_case_benefit_usd: float | None
    tail_spread_usd: float | None
    suppressed_bucket_count: int
    warning_count: int
    error_count: int
    flags: tuple[str, ...]
    notes: tuple[str, ...]


def _trade(
    record_id: str,
    entity: str,
    trade_type: Literal["AR", "AP"],
    amount: float,
    value_date: str,
    status: Literal["CONFIRMED", "FORECAST"],
    description: str = "",
) -> TradeRow:
    return TradeRow(
        record_id=record_id,
        entity=entity,
        type=trade_type,
        currency="MXN",
        amount=amount,
        value_date=date.fromisoformat(value_date),
        status=status,
        description=description,
    )


def _hedge(
    hedge_id: str,
    instrument: Literal["FWD", "NDF"],
    direction: Literal["SELL_MXN_BUY_USD", "BUY_MXN_SELL_USD"],
    notional_mxn: float,
    value_date: str,
    status: Literal["LOCKED", "ACTIVE"] = "ACTIVE",
) -> HedgeRow:
    return HedgeRow(
        hedge_id=hedge_id,
        instrument=instrument,
        direction=direction,
        notional_mxn=notional_mxn,
        value_date=date.fromisoformat(value_date),
        status=status,
    )


def _market(
    spot_usdmxn: float = 18.50,
    points: dict[str, float] | None = None,
    as_of: datetime | None = None,
) -> MarketSnapshot:
    if points is None:
        points = {"2026-03": 0.045, "2026-04": 0.080, "2026-05": 0.115}
    if as_of is None:
        as_of = datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc)
    return MarketSnapshot(
        as_of=as_of,
        spot_usdmxn=spot_usdmxn,
        forward_points_by_month=points,
        provider_metadata={"source": "scenario_matrix"},
    )


def _policy(
    confirmed: float = 1.0,
    forecast: float = 0.5,
    spread_bps: float = 5.0,
    execution_product: Literal["NDF", "FWD"] = "NDF",
    min_trade_size_usd: float = 50_000,
) -> PolicyConfig:
    return PolicyConfig(
        bucket_mode="CALENDAR_MONTH",
        hedge_ratios=HedgeRatios(confirmed=confirmed, forecast=forecast),
        cost_assumptions=CostAssumptions(spread_bps=spread_bps),
        execution_product=execution_product,
        min_trade_size_usd=min_trade_size_usd,
    )


def _importer_base_trades() -> list[TradeRow]:
    return [
        _trade("IMP-T01", "MexImport SA", "AP", 22_000_000, "2026-03-10", "CONFIRMED"),
        _trade("IMP-T02", "MexImport SA", "AP", 18_000_000, "2026-03-24", "CONFIRMED"),
        _trade("IMP-T03", "MexImport SA", "AP", 12_000_000, "2026-04-11", "CONFIRMED"),
        _trade("IMP-T04", "MexImport SA", "AR", 5_000_000, "2026-04-26", "FORECAST"),
        _trade("IMP-T05", "MexImport SA", "AP", 15_000_000, "2026-05-15", "CONFIRMED"),
    ]


def _importer_base_hedges() -> list[HedgeRow]:
    return [
        _hedge("IMP-H01", "NDF", "SELL_MXN_BUY_USD", 16_000_000, "2026-03-15"),
        _hedge("IMP-H02", "NDF", "SELL_MXN_BUY_USD", 12_000_000, "2026-04-15"),
        _hedge("IMP-H03", "FWD", "SELL_MXN_BUY_USD", 8_000_000, "2026-05-10", "LOCKED"),
    ]


def _exporter_base_trades() -> list[TradeRow]:
    return [
        _trade("EXP-T01", "MexExport Global", "AR", 24_000_000, "2026-03-12", "CONFIRMED"),
        _trade("EXP-T02", "MexExport Global", "AR", 16_000_000, "2026-03-26", "CONFIRMED"),
        _trade("EXP-T03", "MexExport Global", "AP", 6_500_000, "2026-04-05", "CONFIRMED"),
        _trade("EXP-T04", "MexExport Global", "AR", 20_000_000, "2026-04-19", "FORECAST"),
        _trade("EXP-T05", "MexExport Global", "AR", 12_000_000, "2026-05-14", "CONFIRMED"),
    ]


def _exporter_base_hedges() -> list[HedgeRow]:
    return [
        _hedge("EXP-H01", "FWD", "BUY_MXN_SELL_USD", 18_000_000, "2026-03-15"),
        _hedge("EXP-H02", "NDF", "BUY_MXN_SELL_USD", 10_000_000, "2026-04-15"),
    ]


def get_scenario_cases() -> list[ScenarioCase]:
    scenarios: list[ScenarioCase] = []

    scenarios.append(
        ScenarioCase(
            id="IMP_BASELINE",
            label="Importer baseline",
            archetype="IMPORTER",
            trades=_importer_base_trades(),
            hedges=_importer_base_hedges(),
            market=_market(),
            policy=_policy(),
            tags=("BASELINE", "IMPORTER"),
            expected_behavior=ExpectedBehavior("PASS"),
        )
    )
    scenarios.append(
        ScenarioCase(
            id="IMP_HIGH_AP_CONCENTRATED",
            label="Importer AP concentration",
            archetype="IMPORTER",
            trades=[
                _trade("IMP-C01", "MexImport SA", "AP", 38_000_000, "2026-03-10", "CONFIRMED"),
                _trade("IMP-C02", "MexImport SA", "AP", 31_000_000, "2026-03-25", "CONFIRMED"),
                _trade("IMP-C03", "MexImport SA", "AP", 24_000_000, "2026-04-12", "CONFIRMED"),
                _trade("IMP-C04", "MexImport SA", "AR", 4_000_000, "2026-05-09", "FORECAST"),
            ],
            hedges=_importer_base_hedges(),
            market=_market(),
            policy=_policy(),
            tags=("IMPORTER", "CONCENTRATED"),
            expected_behavior=ExpectedBehavior("PASS"),
        )
    )
    scenarios.append(
        ScenarioCase(
            id="IMP_LOW_HEDGE_RATIO",
            label="Importer low hedge ratios",
            archetype="IMPORTER",
            trades=_importer_base_trades(),
            hedges=_importer_base_hedges(),
            market=_market(),
            policy=_policy(confirmed=0.60, forecast=0.20, spread_bps=4.0),
            tags=("IMPORTER", "LOW_HEDGE_RATIO"),
            expected_behavior=ExpectedBehavior("PASS"),
        )
    )
    scenarios.append(
        ScenarioCase(
            id="IMP_FULLY_HEDGED",
            label="Importer full coverage",
            archetype="IMPORTER",
            trades=_importer_base_trades(),
            hedges=[
                _hedge("IMP-F01", "NDF", "SELL_MXN_BUY_USD", 22_000_000, "2026-03-15"),
                _hedge("IMP-F02", "NDF", "SELL_MXN_BUY_USD", 20_000_000, "2026-04-15"),
                _hedge("IMP-F03", "FWD", "SELL_MXN_BUY_USD", 14_000_000, "2026-05-15"),
            ],
            market=_market(),
            policy=_policy(confirmed=1.0, forecast=1.0),
            tags=("IMPORTER", "FULL_HEDGE"),
            expected_behavior=ExpectedBehavior("PASS"),
        )
    )
    scenarios.append(
        ScenarioCase(
            id="IMP_VOLATILE_MARKET",
            label="Importer volatile market",
            archetype="IMPORTER",
            trades=_importer_base_trades(),
            hedges=_importer_base_hedges(),
            market=_market(
                spot_usdmxn=19.85,
                points={"2026-03": 0.185, "2026-04": 0.320, "2026-05": 0.475},
            ),
            policy=_policy(spread_bps=10.0),
            tags=("IMPORTER", "VOLATILE"),
            expected_behavior=ExpectedBehavior("PASS"),
        )
    )
    scenarios.append(
        ScenarioCase(
            id="IMP_MISSING_FORWARD_BUCKET",
            label="Importer missing forward bucket",
            archetype="IMPORTER",
            trades=[
                _trade("IMP-M01", "MexImport SA", "AP", 16_000_000, "2026-03-18", "CONFIRMED"),
                _trade("IMP-M02", "MexImport SA", "AP", 9_000_000, "2026-06-11", "CONFIRMED"),
            ],
            hedges=_importer_base_hedges(),
            market=_market(points={"2026-03": 0.045, "2026-04": 0.080, "2026-05": 0.115}),
            policy=_policy(),
            tags=("IMPORTER", "NEGATIVE"),
            expected_behavior=ExpectedBehavior("FAIL", ("V-014",)),
        )
    )

    scenarios.append(
        ScenarioCase(
            id="EXP_BASELINE",
            label="Exporter baseline",
            archetype="EXPORTER",
            trades=_exporter_base_trades(),
            hedges=_exporter_base_hedges(),
            market=_market(),
            policy=_policy(confirmed=1.0, forecast=0.75, execution_product="FWD"),
            tags=("BASELINE", "EXPORTER"),
            expected_behavior=ExpectedBehavior("PASS"),
        )
    )
    scenarios.append(
        ScenarioCase(
            id="EXP_HIGH_AR_CONCENTRATED",
            label="Exporter AR concentration",
            archetype="EXPORTER",
            trades=[
                _trade("EXP-C01", "MexExport Global", "AR", 35_000_000, "2026-03-14", "CONFIRMED"),
                _trade("EXP-C02", "MexExport Global", "AR", 28_000_000, "2026-04-16", "CONFIRMED"),
                _trade("EXP-C03", "MexExport Global", "AR", 22_000_000, "2026-05-18", "FORECAST"),
                _trade("EXP-C04", "MexExport Global", "AP", 4_000_000, "2026-05-28", "CONFIRMED"),
            ],
            hedges=_exporter_base_hedges(),
            market=_market(),
            policy=_policy(confirmed=1.0, forecast=0.8, execution_product="FWD"),
            tags=("EXPORTER", "CONCENTRATED"),
            expected_behavior=ExpectedBehavior("PASS"),
        )
    )
    scenarios.append(
        ScenarioCase(
            id="EXP_OVERHEDGED",
            label="Exporter over-hedged inventory",
            archetype="EXPORTER",
            trades=_exporter_base_trades(),
            hedges=[
                _hedge("EXP-O01", "FWD", "SELL_MXN_BUY_USD", 40_000_000, "2026-03-15"),
                _hedge("EXP-O02", "NDF", "SELL_MXN_BUY_USD", 30_000_000, "2026-04-15"),
                _hedge("EXP-O03", "FWD", "SELL_MXN_BUY_USD", 18_000_000, "2026-05-15"),
            ],
            market=_market(),
            policy=_policy(confirmed=1.0, forecast=0.75, execution_product="FWD"),
            tags=("EXPORTER", "OVERHEDGED"),
            expected_behavior=ExpectedBehavior("PASS"),
        )
    )
    scenarios.append(
        ScenarioCase(
            id="EXP_VOLATILE_MARKET",
            label="Exporter volatile market",
            archetype="EXPORTER",
            trades=_exporter_base_trades(),
            hedges=_exporter_base_hedges(),
            market=_market(
                spot_usdmxn=19.60,
                points={"2026-03": 0.160, "2026-04": 0.260, "2026-05": 0.390},
            ),
            policy=_policy(confirmed=1.0, forecast=0.75, spread_bps=9.0, execution_product="FWD"),
            tags=("EXPORTER", "VOLATILE"),
            expected_behavior=ExpectedBehavior("PASS"),
        )
    )
    scenarios.append(
        ScenarioCase(
            id="EXP_LOW_LIQUIDITY_MIN_TRADE_HIGH",
            label="Exporter low-liquidity high minimum trade",
            archetype="EXPORTER",
            trades=[
                _trade("EXP-L01", "MexExport Global", "AR", 3_000_000, "2026-03-12", "CONFIRMED"),
                _trade("EXP-L02", "MexExport Global", "AR", 2_500_000, "2026-04-10", "FORECAST"),
                _trade("EXP-L03", "MexExport Global", "AR", 2_200_000, "2026-05-18", "CONFIRMED"),
            ],
            hedges=[],
            market=_market(),
            policy=_policy(
                confirmed=1.0,
                forecast=0.75,
                spread_bps=6.0,
                execution_product="FWD",
                min_trade_size_usd=500_000,
            ),
            tags=("EXPORTER", "LOW_LIQUIDITY"),
            expected_behavior=ExpectedBehavior("PASS"),
        )
    )
    scenarios.append(
        ScenarioCase(
            id="EXP_INVALID_FORWARD_POINTS",
            label="Exporter invalid forward points",
            archetype="EXPORTER",
            trades=_exporter_base_trades(),
            hedges=_exporter_base_hedges(),
            market=_market(points={"2026-03": 1500.0, "2026-04": 0.08, "2026-05": 0.11}),
            policy=_policy(confirmed=1.0, forecast=0.75, execution_product="FWD"),
            tags=("EXPORTER", "NEGATIVE"),
            expected_behavior=ExpectedBehavior("FAIL", ("V-021",)),
        )
    )

    scenarios.append(
        ScenarioCase(
            id="BALANCED_NETTED_FLOWS",
            label="Balanced netted commercial flows",
            archetype="MIXED",
            trades=[
                _trade("BAL-T01", "LatAm Balanced", "AR", 16_000_000, "2026-03-12", "CONFIRMED"),
                _trade("BAL-T02", "LatAm Balanced", "AP", 15_500_000, "2026-03-24", "CONFIRMED"),
                _trade("BAL-T03", "LatAm Balanced", "AR", 14_000_000, "2026-04-14", "FORECAST"),
                _trade("BAL-T04", "LatAm Balanced", "AP", 14_200_000, "2026-04-22", "FORECAST"),
                _trade("BAL-T05", "LatAm Balanced", "AR", 12_000_000, "2026-05-10", "CONFIRMED"),
                _trade("BAL-T06", "LatAm Balanced", "AP", 11_800_000, "2026-05-20", "CONFIRMED"),
            ],
            hedges=[
                _hedge("BAL-H01", "NDF", "SELL_MXN_BUY_USD", 4_000_000, "2026-03-15"),
                _hedge("BAL-H02", "NDF", "BUY_MXN_SELL_USD", 3_500_000, "2026-04-15"),
            ],
            market=_market(),
            policy=_policy(confirmed=0.9, forecast=0.5, spread_bps=4.0),
            tags=("MIXED", "NETTED"),
            expected_behavior=ExpectedBehavior("PASS"),
        )
    )
    scenarios.append(
        ScenarioCase(
            id="SEASONAL_SPIKE_Q2",
            label="Seasonal Q2 cash-flow spike",
            archetype="MIXED",
            trades=[
                _trade("SEA-T01", "Seasonal Co", "AR", 8_000_000, "2026-03-15", "CONFIRMED"),
                _trade("SEA-T02", "Seasonal Co", "AP", 7_000_000, "2026-04-15", "CONFIRMED"),
                _trade("SEA-T03", "Seasonal Co", "AR", 48_000_000, "2026-06-12", "CONFIRMED"),
                _trade("SEA-T04", "Seasonal Co", "AP", 6_000_000, "2026-06-25", "FORECAST"),
            ],
            hedges=[
                _hedge("SEA-H01", "FWD", "BUY_MXN_SELL_USD", 5_000_000, "2026-03-15"),
                _hedge("SEA-H02", "NDF", "BUY_MXN_SELL_USD", 6_000_000, "2026-06-20"),
            ],
            market=_market(points={"2026-03": 0.045, "2026-04": 0.080, "2026-05": 0.115, "2026-06": 0.140}),
            policy=_policy(confirmed=1.0, forecast=0.6, spread_bps=5.5, execution_product="FWD"),
            tags=("MIXED", "SEASONAL"),
            expected_behavior=ExpectedBehavior("PASS"),
        )
    )
    scenarios.append(
        ScenarioCase(
            id="STRESS_WIDE_SPREAD_BPS",
            label="Stress with wide dealing spreads",
            archetype="STRESS",
            trades=_importer_base_trades() + _exporter_base_trades(),
            hedges=_importer_base_hedges() + _exporter_base_hedges(),
            market=_market(spot_usdmxn=20.10, points={"2026-03": 0.21, "2026-04": 0.29, "2026-05": 0.40}),
            policy=_policy(confirmed=1.0, forecast=0.7, spread_bps=40.0, execution_product="NDF"),
            tags=("STRESS", "WIDE_SPREAD"),
            expected_behavior=ExpectedBehavior("PASS"),
        )
    )
    scenarios.append(
        ScenarioCase(
            id="STRESS_EXTREME_SPOT_EDGE",
            label="Stress near spot upper bound",
            archetype="STRESS",
            trades=_importer_base_trades(),
            hedges=_importer_base_hedges(),
            market=_market(spot_usdmxn=29.95, points={"2026-03": 0.03, "2026-04": 0.05, "2026-05": 0.08}),
            policy=_policy(confirmed=1.0, forecast=0.5, spread_bps=7.0),
            tags=("STRESS", "SPOT_EDGE"),
            expected_behavior=ExpectedBehavior("PASS"),
        )
    )

    return scenarios

