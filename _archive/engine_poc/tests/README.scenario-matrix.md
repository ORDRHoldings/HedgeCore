# Scenario Matrix Testing

This suite runs a deterministic import-export scenario matrix and writes:

- `scenario_outcomes.csv`
- `scenario_summary.md`

Default artifact location:

- `backend/tests/.artifacts/scenario_matrix`

## Commands

Run only the scenario matrix tests:

```bash
pytest -q tests/test_scenario_matrix.py
```

Run with explicit artifact path:

```bash
pytest -q tests/test_scenario_matrix.py --scenario-report-dir backend/tests/.artifacts/scenario_matrix
```

Enable hard gating on KPI threshold flags:

```bash
pytest -q tests/test_scenario_matrix.py --scenario-hard-gate
```

## Behavior

- Validation and structural regressions always fail tests.
- KPI flags are soft by default and captured in reports.
- In hard-gate mode, KPI threshold flags fail tests.

