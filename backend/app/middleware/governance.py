"""Synexiun governance middleware for TreasuryFX.

Enforces kill switch + budget consumption on every non-exempt request.
Logs requests to the kernel audit chain post-response.
"""

import logging
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("hedgecalc.governance")

# Budget cost per route category — higher for computation-heavy operations
BUDGET_COSTS = {
    "/api/v1/calculate": 20,
    "/api/v1/hedge": 15,
    "/api/v1/positions": 8,
    "/api/v1/risk": 10,
    "/api/v1/portfolios": 5,
    "/api/v1/trades": 10,
    "/api/v1/market-data": 3,
    "/api/v1/instruments": 2,
    "/api/v1/curves": 5,
    "/api/v1/scenarios": 12,
    "/api/v1/reports": 8,
    "/api/v1/audit": 1,
    "/api/v1/admin": 2,
    "/api/v1/organizations": 2,
    "/api/v1/users": 2,
    "/api/v1/auth": 0,  # auth is also exempt but cost 0 as safety
    "/api/v1/policies": 3,
    "/api/v1/counterparties": 3,
    "/api/v1/settlements": 8,
    "/api/v1/cashflows": 5,
    "/api/v1/fx": 5,
}

# Routes exempt from governance checks
EXEMPT_PREFIXES = (
    "/health",
    "/api/health",       # Render health check — must never be gated
    "/api/kernel/health",
    "/api/system",
    "/api/docs",
    "/api/redoc",
    "/api/openapi",
    "/api/v1/auth",
    "/api/v1/public",
    "/favicon",
)


def _get_budget_cost(path: str, method: str) -> int:
    """Determine budget cost based on route and HTTP method."""
    write_multiplier = 3 if method in ("POST", "PUT", "PATCH", "DELETE") else 1
    for prefix, cost in BUDGET_COSTS.items():
        if path.startswith(prefix):
            return cost * write_multiplier
    return 1  # default


_kernel_unavailable: bool | None = None  # None = untried, True = unavailable, False = available


class GovernanceMiddleware(BaseHTTPMiddleware):
    """Enforces kill switch + budget on every non-exempt request."""

    async def dispatch(self, request: Request, call_next):
        global _kernel_unavailable
        path = request.url.path
        method = request.method

        # Skip exempt routes
        if any(path.startswith(p) for p in EXEMPT_PREFIXES):
            return await call_next(request)

        if _kernel_unavailable is True:
            return await call_next(request)

        try:
            from ..core.kernel import governance_check, audit_governance_event
            from ..core.policy_rules import get_match_sig
            _kernel_unavailable = False
        except Exception as _ke:
            # synex_kernel not installed — log once, then pass-through silently
            if _kernel_unavailable is None:
                logger.warning("Governance kernel unavailable (%s), passing all requests through", _ke)
            _kernel_unavailable = True
            return await call_next(request)

        # Governance gate: kill switch + policy + budget
        match_sig = get_match_sig(path)
        cost = _get_budget_cost(path, method)
        try:
            governance_check(match_sig=match_sig, budget_cost=cost)
        except Exception as e:
            error_name = type(e).__name__
            if "KillSwitch" in error_name:
                return JSONResponse(
                    status_code=503,
                    content={
                        "detail": "Service suspended by governance authority",
                        "error": "kill_switch_activated",
                    },
                )
            if "BudgetExhausted" in error_name:
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": "Governance budget exhausted for this epoch",
                        "error": "budget_exhausted",
                    },
                )
            if "PolicyDenied" in error_name:
                return JSONResponse(
                    status_code=403,
                    content={
                        "detail": "Request denied by governance policy",
                        "error": "policy_denied",
                    },
                )
            logger.warning("Governance check error: %s", e)

        # Process the request
        response = await call_next(request)

        # Post-response: audit to kernel chain
        try:
            audit_governance_event(
                "api_request",
                {
                    "method": method,
                    "path": path,
                    "status_code": response.status_code,
                },
            )
        except Exception:
            pass  # never block on audit

        return response
