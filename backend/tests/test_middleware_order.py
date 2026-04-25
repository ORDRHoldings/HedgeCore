"""
Architecture-freeze invariant: middleware registration order.

Starlette/FastAPI executes middleware on the request path in the order
they appear in `app.user_middleware`, where index 0 is OUTERMOST (runs
first on the way in) and the last index is innermost (runs last,
closest to the route handler).

The canonical order is documented in `app/main.py` and CLAUDE.md.
Reordering it has security and observability consequences:

  - SecurityHeaders is the outermost wrapper (added via
    @app.middleware("http") at the end of main.py) so headers like
    X-Frame-Options, CSP, Referrer-Policy apply to every response —
    including CORS preflights.
  - CORS sits just inside SecurityHeaders so OPTIONS preflight bypasses
    auth — but a 403/500 from CORS still gets security headers.
  - IPAllowlist runs before CSRF/auth/audit so blocked IPs do not
    occupy slots in the WORM trail (per ADR-0007).
  - APIKeyAuth runs before RateLimit so tenant-scoped buckets are
    keyed correctly.
  - GZip is innermost so it compresses the rendered response body.

If a contributor adds, removes, or reorders middleware without ADR
review, this test fails loudly. Update CANONICAL_MIDDLEWARE_ORDER
ONLY when an ADR amends the order.
"""
from __future__ import annotations


# Outer → inner (= app.user_middleware order). The first entry runs
# first on the request path, the last entry runs last (closest to the
# route handler).
CANONICAL_MIDDLEWARE_ORDER: tuple[str, ...] = (
    "BaseHTTPMiddleware",            # security_headers (SEC-07) — outermost
    "VercelPreviewCORSMiddleware",
    "CORSMiddleware",
    "IPAllowlistMiddleware",         # ADR-0007: blocks before audit
    "CSRFMiddleware",
    "APIKeyAuthMiddleware",
    "RateLimitMiddleware",
    "AuditHeadersMiddleware",
    "GovernanceMiddleware",
    "GZipMiddleware",                # innermost: compresses response
)


def _registered_middleware_names() -> list[str]:
    """Read the FastAPI app's registered middleware in execution order."""
    from app.main import app

    return [m.cls.__name__ for m in app.user_middleware]


def test_middleware_count_matches_canonical():
    names = _registered_middleware_names()
    assert len(names) == len(CANONICAL_MIDDLEWARE_ORDER), (
        f"Middleware count drift: registered {len(names)} "
        f"({names}) vs canonical {len(CANONICAL_MIDDLEWARE_ORDER)} "
        f"({list(CANONICAL_MIDDLEWARE_ORDER)}). "
        "Adding or removing middleware requires an ADR."
    )


def test_middleware_canonical_order():
    """
    Exact registration order must match. Swapping two adjacent entries
    silently reorders the request pipeline.
    """
    names = _registered_middleware_names()
    assert tuple(names) == CANONICAL_MIDDLEWARE_ORDER, (
        "Middleware order drift detected.\n"
        f"  registered: {names}\n"
        f"  canonical:  {list(CANONICAL_MIDDLEWARE_ORDER)}\n"
        "Reordering requires an ADR and a corresponding update to "
        "CANONICAL_MIDDLEWARE_ORDER in this test."
    )


def test_security_headers_wrap_every_response():
    """
    SEC-07: security headers must be the outermost middleware so they
    apply to every response — including 4xx/5xx and CORS preflights.
    """
    names = _registered_middleware_names()
    assert names[0] == "BaseHTTPMiddleware", (
        "SecurityHeaders middleware must be outermost (index 0). "
        f"Found: {names[0]}"
    )


def test_cors_runs_before_auth():
    """
    CORS must execute BEFORE auth on the request path so OPTIONS
    preflight responds without auth. In execution order: CORS index <
    APIKeyAuth/RateLimit/Audit indices.
    """
    names = _registered_middleware_names()
    cors_idx = names.index("CORSMiddleware")
    auth_idx = names.index("APIKeyAuthMiddleware")
    audit_idx = names.index("AuditHeadersMiddleware")
    rate_idx = names.index("RateLimitMiddleware")
    assert cors_idx < auth_idx, "CORS must run before APIKeyAuth"
    assert cors_idx < audit_idx, "CORS must run before Audit"
    assert cors_idx < rate_idx, "CORS must run before RateLimit"


def test_ipallowlist_runs_before_csrf():
    """
    Per ADR-0007: IPAllowlist must execute BEFORE CSRF on the request
    path so blocked IPs are rejected before any per-request state is
    touched.
    """
    names = _registered_middleware_names()
    ip_idx = names.index("IPAllowlistMiddleware")
    csrf_idx = names.index("CSRFMiddleware")
    assert ip_idx < csrf_idx, (
        "IPAllowlist must run before CSRF on the request path. "
        "See ADR-0007."
    )


def test_apikey_auth_runs_before_rate_limit():
    """
    APIKey auth runs before RateLimit so tenant-scoped buckets are
    keyed correctly — rate limiting an unauthenticated request would
    pollute the global bucket and let a malicious caller starve real
    tenants.
    """
    names = _registered_middleware_names()
    auth_idx = names.index("APIKeyAuthMiddleware")
    rate_idx = names.index("RateLimitMiddleware")
    assert auth_idx < rate_idx, (
        "APIKeyAuth must run before RateLimit so per-tenant bucket "
        "keys are populated."
    )


def test_gzip_is_innermost():
    """GZip must be innermost so it compresses the final response body."""
    names = _registered_middleware_names()
    assert names[-1] == "GZipMiddleware", (
        "GZip must be innermost (last in user_middleware) so it "
        f"compresses the rendered response. Found innermost: {names[-1]}"
    )
