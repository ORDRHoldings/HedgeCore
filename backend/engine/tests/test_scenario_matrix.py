"""Scenario matrix tests for import-export outcome coverage."""

from __future__ import annotations

import math
from pathlib import Path

import pytest

from app.engine.audit import build_run_envelope
from app.engine.kernel import compute_hedge_plan
from app.engine.normalizer import normalize_hedges, normalize_trades
from app.engine.scenarios import compute_scenarios
from app.engine.validator import validate_all
from tests.scenario_matrix.metrics import classify_flags, compute_kpis
from tests.scenario_matrix.reporting import write_scenario_csv, write_scenario_markdown
from tests.scenario_matrix.scenarios import ScenarioCase, ScenarioOutcome, get_scenario_cases


SCENARIO_CASES: list[ScenarioCase] = get_scenario_cases()


def _assert_finite(value, path: str = "root") -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            _assert_finite(item, f"{path}.{key}")
        return
    if isinstance(value, list):
        for idx, item in enumerate(value):
            _assert_finite(item, f"{path}[{idx}]")
        return
    if isinstance(value, (int, float)):
        assert math.isfinite(value), f"Non-finite numeric value at {path}: {value}"


def _build_hashes(
    *,
    run_id: str,
    scenario_case: ScenarioCase,
    hedge_plan_dump: dict,
    scenarios_dump: dict,
) -> tuple[str, str]:
    envelope = build_run_envelope(
        run_id=run_id,
        trades_raw=[t.model_dump(mode="json") for t in scenario_case.trades],
        hedges_raw=[h.model_dump(mode="json") for h in scenario_case.hedges],
        market_raw=scenario_case.market.model_dump(mode="json"),
        policy_raw=scenario_case.policy.model_dump(mode="json"),
        outputs_raw={
            "hedge_plan": hedge_plan_dump,
            "scenario_results": scenarios_dump,
        },
    )
    return envelope.inputs_hash, envelope.outputs_hash


@pytest.fixture(scope="session")
def scenario_outcomes_collector(request):
    report_dir_opt = Path(request.config.getoption("--scenario-report-dir"))
    if report_dir_opt.is_absolute():
        report_dir = report_dir_opt
    else:
        repo_root = Path(__file__).resolve().parents[2]
        report_dir = repo_root / report_dir_opt
    outcomes: list[ScenarioOutcome] = []
    yield outcomes
    if not outcomes:
        return

    csv_path = report_dir / "scenario_outcomes.csv"
    md_path = report_dir / "scenario_summary.md"
    write_scenario_csv(outcomes, csv_path)
    write_scenario_markdown(outcomes, md_path)


@pytest.mark.parametrize("scenario_case", SCENARIO_CASES, ids=lambda c: c.id)
def test_scenario_matrix(
    scenario_case: ScenarioCase,
    scenario_hard_gate: bool,
    scenario_outcomes_collector: list[ScenarioOutcome],
):
    report = validate_all(
        scenario_case.trades,
        scenario_case.hedges,
        scenario_case.market,
        scenario_case.policy,
    )

    notes: list[str] = []
    flags: list[str] = []
    run_id = f"{scenario_case.id}-run"

    expected = scenario_case.expected_behavior.validation_status
    assert report.status == expected, (
        f"{scenario_case.id}: expected validation {expected}, got {report.status}. "
        f"errors={[e.code for e in report.errors]}"
    )

    if expected == "FAIL":
        expected_codes = set(scenario_case.expected_behavior.expected_error_codes)
        actual_codes = {error.code for error in report.errors}
        assert expected_codes.issubset(actual_codes), (
            f"{scenario_case.id}: expected codes {sorted(expected_codes)}, got {sorted(actual_codes)}"
        )
        notes.extend([f"validation_error:{code}" for code in sorted(actual_codes)])
        scenario_outcomes_collector.append(
            ScenarioOutcome(
                scenario_id=scenario_case.id,
                scenario_label=scenario_case.label,
                archetype=scenario_case.archetype,
                run_id=run_id,
                validation_status=report.status,
                total_commercial_exposure_mxn=None,
                total_existing_hedges_mxn=None,
                total_action_mxn=None,
                total_friction_usd=None,
                total_residual_mxn=None,
                coverage_ratio=None,
                worst_case_benefit_usd=None,
                best_case_benefit_usd=None,
                tail_spread_usd=None,
                suppressed_bucket_count=0,
                warning_count=len(report.warnings),
                error_count=len(report.errors),
                flags=tuple(sorted(set(scenario_case.tags))),
                notes=tuple(notes),
            )
        )
        return

    trades_df = normalize_trades(scenario_case.trades)
    hedges_df = normalize_hedges(scenario_case.hedges)
    hedge_plan, _trace_events = compute_hedge_plan(
        trades_df,
        hedges_df,
        scenario_case.market,
        scenario_case.policy,
    )
    scenario_results = compute_scenarios(hedge_plan.buckets, scenario_case.market)

    # Structural assertions that should always gate.
    assert len(scenario_results.sigmas) == 4
    assert len(scenario_results.totals) == len(scenario_results.sigmas)
    assert len(scenario_results.per_bucket) == len(hedge_plan.buckets) * len(scenario_results.sigmas)

    bucket_ids = {b.bucket for b in hedge_plan.buckets}
    per_bucket_ids = {row.bucket for row in scenario_results.per_bucket}
    assert per_bucket_ids == bucket_ids

    hedge_plan_dump = hedge_plan.model_dump(mode="json")
    scenario_dump = scenario_results.model_dump(mode="json")
    _assert_finite(hedge_plan_dump)
    _assert_finite(scenario_dump)

    # Determinism checks via hash stability.
    inputs_hash_1, outputs_hash_1 = _build_hashes(
        run_id=run_id,
        scenario_case=scenario_case,
        hedge_plan_dump=hedge_plan_dump,
        scenarios_dump=scenario_dump,
    )
    hedge_plan_2, _ = compute_hedge_plan(
        trades_df,
        hedges_df,
        scenario_case.market,
        scenario_case.policy,
    )
    scenario_results_2 = compute_scenarios(hedge_plan_2.buckets, scenario_case.market)
    inputs_hash_2, outputs_hash_2 = _build_hashes(
        run_id=run_id,
        scenario_case=scenario_case,
        hedge_plan_dump=hedge_plan_2.model_dump(mode="json"),
        scenarios_dump=scenario_results_2.model_dump(mode="json"),
    )
    assert inputs_hash_1 == inputs_hash_2
    assert outputs_hash_1 == outputs_hash_2

    kpis = compute_kpis(hedge_plan=hedge_plan, scenario_results=scenario_results)
    flags.extend(classify_flags(archetype=scenario_case.archetype, kpis=kpis))

    # Soft KPI checks: log notes by default, gate only in hard mode.
    if flags:
        notes.extend([f"kpi_flag:{flag}" for flag in flags])
        if scenario_hard_gate:
            pytest.fail(f"{scenario_case.id}: KPI threshold breach in hard-gate mode: {flags}")

    summary = hedge_plan.summary
    scenario_outcomes_collector.append(
        ScenarioOutcome(
            scenario_id=scenario_case.id,
            scenario_label=scenario_case.label,
            archetype=scenario_case.archetype,
            run_id=run_id,
            validation_status=report.status,
            total_commercial_exposure_mxn=summary.total_commercial_exposure_mxn,
            total_existing_hedges_mxn=summary.total_existing_hedges_mxn,
            total_action_mxn=summary.total_action_mxn,
            total_friction_usd=summary.total_friction_usd,
            total_residual_mxn=summary.total_residual_mxn,
            coverage_ratio=kpis["coverage_ratio"],
            worst_case_benefit_usd=kpis["worst_case_benefit_usd"],
            best_case_benefit_usd=kpis["best_case_benefit_usd"],
            tail_spread_usd=kpis["tail_spread_usd"],
            suppressed_bucket_count=int(kpis["suppressed_bucket_count"]),
            warning_count=len(report.warnings),
            error_count=len(report.errors),
            flags=tuple(sorted(set(flags + list(scenario_case.tags)))),
            notes=tuple(notes),
        )
    )
