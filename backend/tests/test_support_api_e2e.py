"""
test_support_api_e2e.py -- API Integration Tests for Support Ticketing

Tests:
  1.  POST /v1/support/tickets -> 201, TKT-XXXX ref, ticket row, CREATED event
  2.  GET /v1/support/tickets -> only current tenant tickets
  3.  GET /v1/support/tickets -> pagination (limit/offset)
  4.  GET /v1/support/tickets -> status filter
  5.  GET /v1/support/tickets/{id} -> ticket + events
  6.  GET /v1/support/tickets/{other_tenant_id} -> 404 (no cross-tenant)
  7.  POST /v1/support/tickets/{id}/comments -> COMMENT_ADDED event
  8.  Unauthenticated requests -> 401
  9.  Concurrency: 10 concurrent creates -> no duplicate ticket_refs
  10. Invalid severity -> 422
"""

from __future__ import annotations

import asyncio
import re
import uuid

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import text

from app.main import app
from app.core.db import async_engine

pytestmark = pytest.mark.asyncio

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BASE_URL = "http://test"

TICKET_PAYLOAD = {
    "subject": "Test issue",
    "description": "Detailed description of the test issue for validation",
    "severity": "S2",
    "category": "platform",
}

# Auth routes:   /api/auth/register  /api/auth/login
# Support routes: /api/v1/support/tickets
REGISTER_URL = "/api/auth/register"
LOGIN_URL = "/api/auth/login"
TICKETS_URL = "/api/v1/support/tickets"

# Seeded demo company (always exists from seed_company.py)
DEMO_COMPANY_ID = "11111111-1111-1111-1111-111111111111"


# ---------------------------------------------------------------------------
# Auth helper
# ---------------------------------------------------------------------------

async def _create_company() -> str:
    """Insert a new company row and return its UUID string."""
    cid = str(uuid.uuid4())
    slug = f"testco-{cid[:8]}"
    async with async_engine.begin() as conn:
        await conn.execute(
            text(
                "INSERT INTO companies (id, name, slug, is_active, created_at) "
                "VALUES (:id, :name, :slug, true, NOW())"
            ),
            {"id": cid, "name": f"TestCo-{cid[:8]}", "slug": slug},
        )
    return cid


async def _register_and_login(
    client: AsyncClient,
    suffix: str = "",
    company_id: str | None = None,
) -> str:
    """Register a unique user, assign to a company, and return its access token."""
    email = f"support_test_{uuid.uuid4().hex[:8]}{suffix}@test.com"
    password = "TestPass123!"

    r = await client.post(REGISTER_URL, json={"email": email, "password": password})
    assert r.status_code == 201, f"Register failed ({r.status_code}): {r.text}"
    user_id = r.json()["id"]

    # Assign user to supplied company (or demo company if none specified)
    cid = company_id or DEMO_COMPANY_ID
    async with async_engine.begin() as conn:
        await conn.execute(
            text("UPDATE users SET company_id = :cid WHERE id = :uid"),
            {"cid": cid, "uid": user_id},
        )

    form = {"username": email, "password": password}
    r = await client.post(LOGIN_URL, data=form)
    assert r.status_code == 200, f"Login failed ({r.status_code}): {r.text}"

    return r.json()["access_token"]


# ---------------------------------------------------------------------------
# Shared client helper (avoids repeating boilerplate)
# ---------------------------------------------------------------------------

# Dev bootstrap key registered in APIKeyAuthMiddleware
DEV_API_KEY = "HC_DEV_KEY_001"


def _make_client() -> AsyncClient:
    return AsyncClient(
        transport=ASGITransport(app=app),
        base_url=BASE_URL,
        headers={"X-API-Key": DEV_API_KEY},
    )


# ---------------------------------------------------------------------------
# Test 1: Create ticket
# ---------------------------------------------------------------------------

async def test_create_ticket_201():
    """POST /v1/support/tickets returns 201 with TKT-XXXX ref and a CREATED event."""
    async with _make_client() as client:
        token = await _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}

        r = await client.post(TICKETS_URL, json=TICKET_PAYLOAD, headers=headers)

    assert r.status_code == 201, f"Expected 201, got {r.status_code}: {r.text}"
    body = r.json()

    assert "ticket_ref" in body, f"Response missing ticket_ref: {body}"
    assert re.match(r"^TKT-\d{4}$", body["ticket_ref"]), (
        f"ticket_ref '{body['ticket_ref']}' does not match TKT-XXXX format"
    )

    assert "id" in body, "Response missing id (UUID)"
    # Validate it is a valid UUID
    uuid.UUID(body["id"])

    assert "events" in body, "Response missing events list"
    assert len(body["events"]) == 1, (
        f"Expected 1 event on creation, got {len(body['events'])}"
    )
    event = body["events"][0]
    assert event["event_type"] == "CREATED", (
        f"First event should be CREATED, got '{event['event_type']}'"
    )
    assert event["new_status"] == "OPEN", (
        f"CREATED event new_status should be OPEN, got '{event['new_status']}'"
    )


# ---------------------------------------------------------------------------
# Test 2: Tenant isolation on list
# ---------------------------------------------------------------------------

async def test_tenant_isolation_list():
    """User B must not see tickets created by User A (different tenant/company)."""
    async with _make_client() as client:
        co_a = await _create_company()
        co_b = await _create_company()
        token_a = await _register_and_login(client, "_tenA", company_id=co_a)
        token_b = await _register_and_login(client, "_tenB", company_id=co_b)

        headers_a = {"Authorization": f"Bearer {token_a}"}
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # User A creates a ticket
        r = await client.post(TICKETS_URL, json=TICKET_PAYLOAD, headers=headers_a)
        assert r.status_code == 201, f"User A ticket creation failed: {r.text}"
        ticket_ref_a = r.json()["ticket_ref"]

        # User B lists their tickets
        r = await client.get(TICKETS_URL, headers=headers_b)
        assert r.status_code == 200, f"User B list failed: {r.text}"
        b_body = r.json()

    # The response can be a list or a paginated envelope — normalise
    if isinstance(b_body, list):
        b_tickets = b_body
    else:
        b_tickets = b_body.get("items", b_body.get("tickets", b_body.get("results", [])))

    b_refs = [t["ticket_ref"] for t in b_tickets]
    assert ticket_ref_a not in b_refs, (
        f"Tenant isolation breach: User B can see User A's ticket {ticket_ref_a}"
    )


# ---------------------------------------------------------------------------
# Test 3: Pagination
# ---------------------------------------------------------------------------

async def test_pagination():
    """limit/offset pagination must return the correct slice of results."""
    async with _make_client() as client:
        token = await _register_and_login(client, "_pgn")
        headers = {"Authorization": f"Bearer {token}"}

        # Create 5 tickets
        for _ in range(5):
            r = await client.post(TICKETS_URL, json=TICKET_PAYLOAD, headers=headers)
            assert r.status_code == 201

        # Page 1: first 2
        r1 = await client.get(
            TICKETS_URL, params={"limit": 2, "offset": 0}, headers=headers
        )
        assert r1.status_code == 200, f"Pagination page 1 failed: {r1.text}"
        body1 = r1.json()
        items1 = body1 if isinstance(body1, list) else body1.get("items", body1.get("tickets", body1.get("results", [])))
        assert len(items1) <= 2, f"limit=2 returned {len(items1)} items"

        # Page 2: next 2
        r2 = await client.get(
            TICKETS_URL, params={"limit": 2, "offset": 2}, headers=headers
        )
        assert r2.status_code == 200, f"Pagination page 2 failed: {r2.text}"
        body2 = r2.json()
        items2 = body2 if isinstance(body2, list) else body2.get("items", body2.get("tickets", body2.get("results", [])))

        refs1 = {t["ticket_ref"] for t in items1}
        refs2 = {t["ticket_ref"] for t in items2}
        # The two pages should not completely overlap (unless fewer than 4 tickets exist
        # which cannot happen here since we just created 5)
        assert not refs1.issuperset(refs2) or not refs2.issuperset(refs1) or len(refs1) == 0, (
            "Offset pagination returned identical results for page 1 and page 2"
        )

        # Full list: should return all 5
        r_all = await client.get(
            TICKETS_URL, params={"limit": 10, "offset": 0}, headers=headers
        )
        assert r_all.status_code == 200
        body_all = r_all.json()
        items_all = body_all if isinstance(body_all, list) else body_all.get("items", body_all.get("tickets", body_all.get("results", [])))
        assert len(items_all) >= 5, (
            f"Expected at least 5 tickets with limit=10, got {len(items_all)}"
        )


# ---------------------------------------------------------------------------
# Test 4: Status filter
# ---------------------------------------------------------------------------

async def test_status_filter():
    """?status=OPEN returns the ticket; ?status=CLOSED does not."""
    async with _make_client() as client:
        token = await _register_and_login(client, "_sf")
        headers = {"Authorization": f"Bearer {token}"}

        r = await client.post(TICKETS_URL, json=TICKET_PAYLOAD, headers=headers)
        assert r.status_code == 201
        ticket_ref = r.json()["ticket_ref"]

        # Filter by OPEN — must include the new ticket
        r_open = await client.get(
            TICKETS_URL, params={"status": "OPEN"}, headers=headers
        )
        assert r_open.status_code == 200
        body_open = r_open.json()
        items_open = body_open if isinstance(body_open, list) else body_open.get("items", body_open.get("tickets", body_open.get("results", [])))
        open_refs = {t["ticket_ref"] for t in items_open}
        assert ticket_ref in open_refs, (
            f"Ticket {ticket_ref} not found in ?status=OPEN results: {open_refs}"
        )

        # Filter by CLOSED — must NOT include the new ticket (it was never closed)
        r_closed = await client.get(
            TICKETS_URL, params={"status": "CLOSED"}, headers=headers
        )
        assert r_closed.status_code == 200
        body_closed = r_closed.json()
        items_closed = body_closed if isinstance(body_closed, list) else body_closed.get("items", body_closed.get("tickets", body_closed.get("results", [])))
        closed_refs = {t["ticket_ref"] for t in items_closed}
        assert ticket_ref not in closed_refs, (
            f"Ticket {ticket_ref} unexpectedly appears in ?status=CLOSED results"
        )


# ---------------------------------------------------------------------------
# Test 5: Get single ticket with events
# ---------------------------------------------------------------------------

async def test_get_single_ticket_with_events():
    """GET /v1/support/tickets/{id} returns ticket + both CREATED and COMMENT_ADDED events."""
    async with _make_client() as client:
        token = await _register_and_login(client, "_gst")
        headers = {"Authorization": f"Bearer {token}"}

        # Create ticket
        r = await client.post(TICKETS_URL, json=TICKET_PAYLOAD, headers=headers)
        assert r.status_code == 201
        ticket_id = r.json()["id"]

        # Add a comment
        comment_url = f"{TICKETS_URL}/{ticket_id}/comments"
        r_comment = await client.post(
            comment_url, json={"comment": "First comment on this ticket"}, headers=headers
        )
        assert r_comment.status_code == 200, (
            f"Add comment failed ({r_comment.status_code}): {r_comment.text}"
        )

        # Fetch the single ticket
        r_get = await client.get(f"{TICKETS_URL}/{ticket_id}", headers=headers)

    assert r_get.status_code == 200, (
        f"GET single ticket failed ({r_get.status_code}): {r_get.text}"
    )
    body = r_get.json()

    assert "events" in body, "Ticket response missing events list"
    events = body["events"]
    assert len(events) == 2, (
        f"Expected 2 events (CREATED + COMMENT_ADDED), got {len(events)}: "
        f"{[e['event_type'] for e in events]}"
    )

    # Events must be ordered oldest-first
    assert events[0]["event_type"] == "CREATED", (
        f"First event should be CREATED, got '{events[0]['event_type']}'"
    )
    assert events[1]["event_type"] == "COMMENT_ADDED", (
        f"Second event should be COMMENT_ADDED, got '{events[1]['event_type']}'"
    )


# ---------------------------------------------------------------------------
# Test 6: Cross-tenant 404
# ---------------------------------------------------------------------------

async def test_cross_tenant_ticket_returns_404():
    """User B requesting User A's ticket must receive 404 (no cross-tenant leakage)."""
    async with _make_client() as client:
        co_a = await _create_company()
        co_b = await _create_company()
        token_a = await _register_and_login(client, "_ctA", company_id=co_a)
        token_b = await _register_and_login(client, "_ctB", company_id=co_b)

        headers_a = {"Authorization": f"Bearer {token_a}"}
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # User A creates a ticket
        r = await client.post(TICKETS_URL, json=TICKET_PAYLOAD, headers=headers_a)
        assert r.status_code == 201
        ticket_id_a = r.json()["id"]

        # User B attempts to read User A's ticket
        r_cross = await client.get(
            f"{TICKETS_URL}/{ticket_id_a}", headers=headers_b
        )

    assert r_cross.status_code == 404, (
        f"Expected 404 for cross-tenant access, got {r_cross.status_code}: {r_cross.text}"
    )
    # Response body must not expose internal details that confirm the ticket's existence
    body_text = r_cross.text.lower()
    assert "ticket_ref" not in body_text, (
        "Cross-tenant 404 response leaks ticket_ref — information disclosure risk"
    )


# ---------------------------------------------------------------------------
# Test 7: Add comment
# ---------------------------------------------------------------------------

async def test_add_comment_creates_comment_added_event():
    """POST /v1/support/tickets/{id}/comments must append a COMMENT_ADDED event."""
    async with _make_client() as client:
        token = await _register_and_login(client, "_ac")
        headers = {"Authorization": f"Bearer {token}"}

        # Create ticket
        r = await client.post(TICKETS_URL, json=TICKET_PAYLOAD, headers=headers)
        assert r.status_code == 201
        ticket_id = r.json()["id"]

        # Add comment
        comment_text = "Detailed follow-up comment for the test ticket"
        r_comment = await client.post(
            f"{TICKETS_URL}/{ticket_id}/comments",
            json={"comment": comment_text},
            headers=headers,
        )

    assert r_comment.status_code == 200, (
        f"Add comment failed ({r_comment.status_code}): {r_comment.text}"
    )
    body = r_comment.json()

    assert "events" in body, "Comment response missing events list"
    events = body["events"]
    assert len(events) == 2, (
        f"Expected 2 events after comment, got {len(events)}: "
        f"{[e['event_type'] for e in events]}"
    )

    last_event = events[-1]
    assert last_event["event_type"] == "COMMENT_ADDED", (
        f"Last event should be COMMENT_ADDED, got '{last_event['event_type']}'"
    )
    assert last_event.get("comment") == comment_text, (
        f"Comment text mismatch: expected '{comment_text}', "
        f"got '{last_event.get('comment')}'"
    )


# ---------------------------------------------------------------------------
# Test 8: Unauthenticated requests return 401
# ---------------------------------------------------------------------------

async def test_unauthenticated_requests_return_401():
    """Requests without an Authorization header must be rejected with 401 or 403."""
    async with _make_client() as client:
        r_post = await client.post(TICKETS_URL, json=TICKET_PAYLOAD)
        r_get = await client.get(TICKETS_URL)

    assert r_post.status_code in (401, 403), (
        f"Expected 401/403 for unauthenticated POST, got {r_post.status_code}"
    )
    assert r_get.status_code in (401, 403), (
        f"Expected 401/403 for unauthenticated GET, got {r_get.status_code}"
    )


# ---------------------------------------------------------------------------
# Test 9: Concurrency — 10 concurrent creates produce unique ticket_refs
# ---------------------------------------------------------------------------

async def test_concurrent_ticket_creation():
    """
    10 concurrent ticket creates for the same user must all succeed and must
    produce 10 unique ticket_refs (advisory lock prevents sequence collisions).
    """
    async with _make_client() as client:
        token = await _register_and_login(client, "_conc")
        headers = {"Authorization": f"Bearer {token}"}

        async def _create_one() -> dict:
            r = await client.post(TICKETS_URL, json=TICKET_PAYLOAD, headers=headers)
            if r.status_code == 201:
                return r.json()
            raise RuntimeError(
                f"Concurrent create failed ({r.status_code}): {r.text}"
            )

        tasks = [_create_one() for _ in range(10)]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    errors = [r for r in results if isinstance(r, Exception)]
    successes = [r for r in results if not isinstance(r, Exception)]
    refs = [r["ticket_ref"] for r in successes]

    assert len(refs) == len(set(refs)), (
        f"Duplicate ticket_refs detected under concurrency: {refs}"
    )
    assert len(successes) == 10, (
        f"Expected 10 successful concurrent creates, got {len(successes)}. "
        f"Errors: {errors}"
    )


# ---------------------------------------------------------------------------
# Test 10: Invalid severity -> 422
# ---------------------------------------------------------------------------

async def test_invalid_severity_returns_422():
    """POST with severity='S9' (not in S0-S4 Literal) must return 422 Unprocessable Entity."""
    async with _make_client() as client:
        token = await _register_and_login(client, "_sv")
        headers = {"Authorization": f"Bearer {token}"}

        bad_payload = {**TICKET_PAYLOAD, "severity": "S9"}
        r = await client.post(TICKETS_URL, json=bad_payload, headers=headers)

    assert r.status_code == 422, (
        f"Expected 422 for invalid severity 'S9', got {r.status_code}: {r.text}"
    )
