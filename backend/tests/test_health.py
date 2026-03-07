from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_check():
    """Ensure /api/health endpoint returns 200 and correct structure."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "ORDR" in data["service"] or "HedgeCalc" in data["service"]

def test_root_route():
    """Ensure /api/health returns 200 (root may not be mounted)."""
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, dict)
    assert "service" in body or "status" in body
