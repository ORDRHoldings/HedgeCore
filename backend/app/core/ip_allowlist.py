"""
app/core/ip_allowlist.py

IP Allowlist enforcement for high-value execution endpoints.

Supports:
- Exact IP matches ("192.168.1.100")
- CIDR ranges ("10.0.0.0/8")
- Empty list = disabled (allow all)
- X-Forwarded-For header support for Render.com proxy
"""

import ipaddress
import logging

from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)


def get_client_ip(request: Request) -> str:
    """Extract real client IP respecting X-Forwarded-For (Render.com proxy)."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def check_ip_allowlist(client_ip: str, allowlist: list[str]) -> bool:
    """Return True if client_ip is within any allowlisted CIDR or exact IP."""
    if not allowlist:
        return True  # empty = disabled
    try:
        ip = ipaddress.ip_address(client_ip)
        for entry in allowlist:
            try:
                if "/" in entry:
                    if ip in ipaddress.ip_network(entry, strict=False):
                        return True
                else:
                    if ip == ipaddress.ip_address(entry):
                        return True
            except ValueError:
                continue
    except ValueError:
        pass
    return False


def enforce_execution_ip_allowlist(request: Request, settings) -> None:
    """Call this at the start of execution endpoints when allowlist is enabled.

    Raises HTTP 403 if:
      - EXECUTION_IP_ALLOWLIST_ENABLED is True
      - EXECUTION_IP_ALLOWLIST is non-empty
      - client IP is not in the allowlist

    Is a no-op (passes silently) when allowlist is disabled or empty.
    """
    if not getattr(settings, "EXECUTION_IP_ALLOWLIST_ENABLED", False):
        return
    allowlist = getattr(settings, "EXECUTION_IP_ALLOWLIST", [])
    if not allowlist:
        return
    client_ip = get_client_ip(request)
    if not check_ip_allowlist(client_ip, allowlist):
        logger.warning(
            "IP_ALLOWLIST: execution action blocked for client_ip=%s — not in allowlist",
            client_ip,
        )
        raise HTTPException(
            status_code=403,
            detail=f"IP_NOT_ALLOWLISTED: {client_ip} is not in the execution IP allowlist",
        )
    logger.debug("IP_ALLOWLIST: client_ip=%s passed allowlist check", client_ip)
