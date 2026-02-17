from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_check():
    """Ensure /health endpoint returns 200 and correct structure."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "HedgeCalc API"

def test_root_route():
    """Ensure root endpoint (/) returns 200 and contains welcome or metadata."""
    response = client.get("/")
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, dict)
    assert "service" in body or "message" in body
