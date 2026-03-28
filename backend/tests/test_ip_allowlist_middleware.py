"""Tests for IPAllowlistMiddleware."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.middleware.ip_allowlist_middleware import IPAllowlistMiddleware


def _make_app(allowed_ips: list[str] | None) -> FastAPI:
    app = FastAPI()

    @app.get("/probe")
    async def probe() -> dict[str, str]:
        return {"status": "ok"}

    app.add_middleware(IPAllowlistMiddleware, allowed_ips=allowed_ips)
    return app


class TestIPAllowlistOpen:
    def test_empty_list_allows_all(self) -> None:
        assert TestClient(_make_app([])).get("/probe").status_code == 200

    def test_none_allows_all(self) -> None:
        assert TestClient(_make_app(None)).get("/probe").status_code == 200


class TestIPAllowlistBlocking:
    def test_allowlisted_ip_passes(self) -> None:
        assert TestClient(_make_app(["127.0.0.1"])).get("/probe").status_code == 200

    def test_blocked_ip_returns_403(self) -> None:
        resp = TestClient(_make_app(["10.0.0.1"])).get("/probe")
        assert resp.status_code == 403
        assert "IP_NOT_ALLOWLISTED" in resp.json()["detail"]

    def test_cidr_allows_matching_ip(self) -> None:
        assert TestClient(_make_app(["127.0.0.0/8"])).get("/probe").status_code == 200

    def test_cidr_blocks_non_matching(self) -> None:
        assert TestClient(_make_app(["192.168.0.0/16"])).get("/probe").status_code == 403

    def test_multiple_entries_first_match_passes(self) -> None:
        assert TestClient(_make_app(["10.0.0.1", "127.0.0.1"])).get("/probe").status_code == 200


class TestIPAllowlistForwardedFor:
    def test_x_forwarded_for_allowlisted(self) -> None:
        resp = TestClient(_make_app(["203.0.113.1"])).get(
            "/probe", headers={"X-Forwarded-For": "203.0.113.1"}
        )
        assert resp.status_code == 200

    def test_x_forwarded_for_blocked(self) -> None:
        resp = TestClient(_make_app(["10.0.0.1"])).get(
            "/probe", headers={"X-Forwarded-For": "203.0.113.99"}
        )
        assert resp.status_code == 403

    def test_x_forwarded_for_chain_uses_first_ip(self) -> None:
        resp = TestClient(_make_app(["203.0.113.1"])).get(
            "/probe",
            headers={"X-Forwarded-For": "203.0.113.1, 10.0.0.1, 172.16.0.1"},
        )
        assert resp.status_code == 200
