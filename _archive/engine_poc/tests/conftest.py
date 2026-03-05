"""Pytest fixtures and golden-master update flag."""

from __future__ import annotations

import csv
import json
from pathlib import Path

import pytest

from app.schemas.hedges import HedgeRow
from app.schemas.market import MarketSnapshot
from app.schemas.policy import PolicyConfig
from app.schemas.trades import TradeRow

FIXTURE_DIR = Path(__file__).parent / "fixtures"
GOLDEN_DIR = FIXTURE_DIR / "golden"


def pytest_addoption(parser):
    parser.addoption(
        "--update-golden",
        action="store_true",
        default=False,
        help="Regenerate golden-master expected output files.",
    )
    parser.addoption(
        "--scenario-report-dir",
        action="store",
        default="backend/tests/.artifacts/scenario_matrix",
        help="Output directory for scenario matrix CSV/Markdown reports.",
    )
    parser.addoption(
        "--scenario-hard-gate",
        action="store_true",
        default=False,
        help="Fail scenario matrix tests on KPI threshold breaches.",
    )


@pytest.fixture
def update_golden(request):
    return request.config.getoption("--update-golden")


@pytest.fixture
def scenario_report_dir(request) -> Path:
    report_dir = Path(request.config.getoption("--scenario-report-dir"))
    if report_dir.is_absolute():
        return report_dir
    repo_root = Path(__file__).resolve().parents[2]
    return repo_root / report_dir


@pytest.fixture
def scenario_hard_gate(request) -> bool:
    return bool(request.config.getoption("--scenario-hard-gate"))


@pytest.fixture
def golden_trades() -> list[TradeRow]:
    rows = []
    with open(GOLDEN_DIR / "input_trades.csv") as f:
        for row in csv.DictReader(f):
            row["amount"] = float(row["amount"])
            rows.append(TradeRow(**row))
    return rows


@pytest.fixture
def golden_hedges() -> list[HedgeRow]:
    rows = []
    with open(GOLDEN_DIR / "input_hedges.csv") as f:
        for row in csv.DictReader(f):
            row["notional_mxn"] = float(row["notional_mxn"])
            rows.append(HedgeRow(**row))
    return rows


@pytest.fixture
def golden_market() -> MarketSnapshot:
    with open(GOLDEN_DIR / "input_market.json") as f:
        return MarketSnapshot(**json.load(f))


@pytest.fixture
def golden_policy() -> PolicyConfig:
    with open(GOLDEN_DIR / "input_policy.json") as f:
        return PolicyConfig(**json.load(f))


@pytest.fixture
def golden_market_raw() -> dict:
    with open(GOLDEN_DIR / "input_market.json") as f:
        return json.load(f)


@pytest.fixture
def golden_policy_raw() -> dict:
    with open(GOLDEN_DIR / "input_policy.json") as f:
        return json.load(f)
