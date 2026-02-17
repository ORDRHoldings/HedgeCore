"""Integration tests for the full API round-trip."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

VALID_PAYLOAD = {
    "trades": [
        {"record_id": "T1", "entity": "MexCo", "type": "AP", "currency": "MXN",
         "amount": 10000000, "value_date": "2025-07-15", "status": "CONFIRMED"},
        {"record_id": "T2", "entity": "MexCo", "type": "AR", "currency": "MXN",
         "amount": 5000000, "value_date": "2025-07-20", "status": "FORECAST"},
    ],
    "hedges": [
        {"hedge_id": "H1", "instrument": "NDF", "direction": "SELL_MXN_BUY_USD",
         "notional_mxn": 5000000, "value_date": "2025-07-15", "status": "ACTIVE"},
    ],
    "market": {
        "as_of": "2025-06-15T12:00:00Z",
        "spot_usdmxn": 17.15,
        "forward_points_by_month": {"2025-07": 0.035},
    },
    "policy": {
        "hedge_ratios": {"confirmed": 1.0, "forecast": 0.5},
        "cost_assumptions": {"spread_bps": 5.0},
        "execution_product": "NDF",
        "min_trade_size_usd": 50000,
    },
}


def test_health():
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_calculate_valid():
    r = client.post("/api/v1/calculate", json=VALID_PAYLOAD)
    assert r.status_code == 200
    data = r.json()
    assert data["validation_report"]["status"] == "PASS"
    assert len(data["hedge_plan"]["buckets"]) == 1
    assert data["run_envelope"]["inputs_hash"]
    assert data["run_envelope"]["outputs_hash"]


def test_calculate_invalid_amount():
    bad = dict(VALID_PAYLOAD)
    bad["trades"] = [
        {"record_id": "T1", "entity": "E", "type": "AR", "currency": "MXN",
         "amount": -1, "value_date": "2025-07-15", "status": "CONFIRMED"},
    ]
    r = client.post("/api/v1/calculate", json=bad)
    assert r.status_code == 422


def test_calculate_empty_trades():
    bad = dict(VALID_PAYLOAD)
    bad["trades"] = []
    r = client.post("/api/v1/calculate", json=bad)
    assert r.status_code == 422


def test_calculate_spot_out_of_range():
    bad = dict(VALID_PAYLOAD)
    bad["market"] = dict(VALID_PAYLOAD["market"])
    bad["market"]["spot_usdmxn"] = 5.0
    r = client.post("/api/v1/calculate", json=bad)
    assert r.status_code == 422


def test_export_pdf():
    r = client.post("/api/v1/calculate", json=VALID_PAYLOAD)
    run_id = r.json()["run_id"]
    r2 = client.get(f"/api/v1/export/pdf/{run_id}")
    assert r2.status_code == 200
    assert r2.headers["content-type"] == "application/pdf"


def test_export_excel():
    r = client.post("/api/v1/calculate", json=VALID_PAYLOAD)
    run_id = r.json()["run_id"]
    r2 = client.get(f"/api/v1/export/excel/{run_id}")
    assert r2.status_code == 200


def test_export_zip():
    r = client.post("/api/v1/calculate", json=VALID_PAYLOAD)
    run_id = r.json()["run_id"]
    r2 = client.get(f"/api/v1/export/zip/{run_id}")
    assert r2.status_code == 200
    assert r2.headers["content-type"] == "application/zip"


def test_export_not_found():
    r = client.get("/api/v1/export/pdf/nonexistent")
    assert r.status_code == 404
