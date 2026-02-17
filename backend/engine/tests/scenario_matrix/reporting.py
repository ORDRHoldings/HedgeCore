"""CSV/Markdown reporting helpers for scenario matrix runs."""

from __future__ import annotations

import csv
from datetime import datetime, timezone
from pathlib import Path

from .scenarios import ScenarioOutcome


CSV_COLUMNS = [
    "scenario_id",
    "scenario_label",
    "archetype",
    "validation_status",
    "total_commercial_exposure_mxn",
    "total_existing_hedges_mxn",
    "total_action_mxn",
    "total_friction_usd",
    "total_residual_mxn",
    "coverage_ratio",
    "worst_case_benefit_usd",
    "best_case_benefit_usd",
    "tail_spread_usd",
    "suppressed_bucket_count",
    "warning_count",
    "error_count",
    "notes",
]


def _fmt_num(value: float | None) -> str:
    if value is None:
        return ""
    return f"{value:.6f}"


def write_scenario_csv(outcomes: list[ScenarioOutcome], csv_path: Path) -> None:
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for outcome in outcomes:
            writer.writerow(
                {
                    "scenario_id": outcome.scenario_id,
                    "scenario_label": outcome.scenario_label,
                    "archetype": outcome.archetype,
                    "validation_status": outcome.validation_status,
                    "total_commercial_exposure_mxn": _fmt_num(outcome.total_commercial_exposure_mxn),
                    "total_existing_hedges_mxn": _fmt_num(outcome.total_existing_hedges_mxn),
                    "total_action_mxn": _fmt_num(outcome.total_action_mxn),
                    "total_friction_usd": _fmt_num(outcome.total_friction_usd),
                    "total_residual_mxn": _fmt_num(outcome.total_residual_mxn),
                    "coverage_ratio": _fmt_num(outcome.coverage_ratio),
                    "worst_case_benefit_usd": _fmt_num(outcome.worst_case_benefit_usd),
                    "best_case_benefit_usd": _fmt_num(outcome.best_case_benefit_usd),
                    "tail_spread_usd": _fmt_num(outcome.tail_spread_usd),
                    "suppressed_bucket_count": str(outcome.suppressed_bucket_count),
                    "warning_count": str(outcome.warning_count),
                    "error_count": str(outcome.error_count),
                    "notes": " | ".join(outcome.notes),
                }
            )


def write_scenario_markdown(outcomes: list[ScenarioOutcome], markdown_path: Path) -> None:
    markdown_path.parent.mkdir(parents=True, exist_ok=True)
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    passing = [o for o in outcomes if o.validation_status == "PASS"]
    failed = [o for o in outcomes if o.validation_status != "PASS"]

    top_residual = sorted(
        passing,
        key=lambda o: abs(o.total_residual_mxn or 0.0),
        reverse=True,
    )[:5]
    top_friction = sorted(
        passing,
        key=lambda o: abs(o.total_friction_usd or 0.0),
        reverse=True,
    )[:5]
    suppressed = [o for o in passing if o.suppressed_bucket_count > 0]

    lines: list[str] = []
    lines.append("# Scenario Matrix Summary")
    lines.append("")
    lines.append(f"- Generated: {generated_at}")
    lines.append(f"- Total scenarios: {len(outcomes)}")
    lines.append(f"- Validation PASS: {len(passing)}")
    lines.append(f"- Validation FAIL: {len(failed)}")
    lines.append("")

    lines.append("## Top 5 Residual-Risk Scenarios")
    if top_residual:
        for item in top_residual:
            lines.append(
                f"- `{item.scenario_id}` ({item.scenario_label}) -> residual_mxn={item.total_residual_mxn:,.2f}"
            )
    else:
        lines.append("- No passing scenarios available.")
    lines.append("")

    lines.append("## Top 5 Friction-Cost Scenarios")
    if top_friction:
        for item in top_friction:
            lines.append(
                f"- `{item.scenario_id}` ({item.scenario_label}) -> friction_usd={item.total_friction_usd:,.2f}"
            )
    else:
        lines.append("- No passing scenarios available.")
    lines.append("")

    lines.append("## Validation Failures")
    if failed:
        for item in failed:
            lines.append(
                f"- `{item.scenario_id}` ({item.scenario_label}) -> {', '.join(item.notes) if item.notes else 'No notes'}"
            )
    else:
        lines.append("- None")
    lines.append("")

    lines.append("## Suppressed Actions And Implications")
    if suppressed:
        for item in suppressed:
            implication = (
                "Likely constrained by minimum trade size or low-liquidity ticket thresholds."
                if "LOW_LIQUIDITY" in item.flags
                else "Actions below minimum executable ticket; monitor residual drift."
            )
            lines.append(
                f"- `{item.scenario_id}` -> suppressed_buckets={item.suppressed_bucket_count}. {implication}"
            )
    else:
        lines.append("- None")
    lines.append("")

    markdown_path.write_text("\n".join(lines), encoding="utf-8")

