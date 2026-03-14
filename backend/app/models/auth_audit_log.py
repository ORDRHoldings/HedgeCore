"""
app/models/auth_audit_log.py
HedgeCalc - Phase V (Authentication & Security)
Auth audit model + helper for structured authentication event logging.
"""

from __future__ import annotations

import enum
import logging
import uuid

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.user import Base

logger = logging.getLogger(__name__)


# -------------------------------------------------------------------------
# Enumerations
# -------------------------------------------------------------------------
class AuthEventType(str, enum.Enum):
    LOGIN_SUCCESS = "LOGIN_SUCCESS"
    LOGIN_FAIL = "LOGIN_FAIL"
    REGISTER_SUCCESS = "REGISTER_SUCCESS"
    REGISTER_FAIL = "REGISTER_FAIL"
    REFRESH_SUCCESS = "REFRESH_SUCCESS"
    REFRESH_FAIL = "REFRESH_FAIL"
    LOGOUT = "LOGOUT"
    ME = "ME"  # include profile fetch audit


class AuthEventStatus(str, enum.Enum):
    SUCCESS = "SUCCESS"
    FAIL = "FAIL"


class AuthReasonCode(str, enum.Enum):
    OK = "OK"
    EMAIL_ALREADY_EXISTS = "EMAIL_ALREADY_EXISTS"
    EMAIL_NOT_FOUND = "EMAIL_NOT_FOUND"
    INVALID_PASSWORD = "INVALID_PASSWORD"
    ACCOUNT_DISABLED = "ACCOUNT_DISABLED"
    TOKEN_EXPIRED = "TOKEN_EXPIRED"
    TOKEN_REVOKED = "TOKEN_REVOKED"
    TOKEN_INVALID = "TOKEN_INVALID"
    ROTATION_REVOKED_PREVIOUS = "ROTATION_REVOKED_PREVIOUS"
    SERVER_ERROR = "SERVER_ERROR"


# -------------------------------------------------------------------------
# Model
# -------------------------------------------------------------------------
class AuthAuditLog(Base):
    __tablename__ = "auth_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    event_type: Mapped[AuthEventType] = mapped_column(
        SAEnum(AuthEventType, name="auth_event_type"), nullable=False, index=True
    )
    status: Mapped[AuthEventStatus] = mapped_column(
        SAEnum(AuthEventStatus, name="auth_event_status"), nullable=False
    )

    reason_code: Mapped[AuthReasonCode | None] = mapped_column(
        SAEnum(AuthReasonCode, name="auth_reason_code"), nullable=True
    )

    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    route: Mapped[str | None] = mapped_column(String(255), nullable=True)
    method: Mapped[str | None] = mapped_column(String(16), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[DateTime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    user = relationship("User", backref="auth_audit_logs", lazy="joined")

    __table_args__ = (
        Index("ix_auth_audit_logs_user_created_at", "user_id", "created_at"),
        Index("ix_auth_audit_logs_event_created_at", "event_type", "created_at"),
    )

    def __repr__(self) -> str:
        return (
            f"<AuthAuditLog id={self.id} user_id={self.user_id} "
            f"event_type={self.event_type} status={self.status} "
            f"reason_code={self.reason_code} created_at={self.created_at}>"
        )


# -------------------------------------------------------------------------
# Helper: record an auth event (safe + flexible)
# -------------------------------------------------------------------------
async def record_auth_event(
    db_session,
    /,
    event_type: AuthEventType | None = None,
    status: AuthEventStatus | None = None,
    reason_code: AuthReasonCode | None = None,
    user_id: uuid.UUID | None = None,
    request_id: str | None = None,
    route: str | None = None,
    method: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    message: str | None = None,
) -> None:
    """
    Persist a structured authentication audit event.
    This function now accepts either positional or keyword argument calls.
    It never raises--errors are logged only.
    """
    try:
        if not event_type or not status:
            logger.warning(
                "Skipping audit event with missing type or status: "
                f"event_type={event_type}, status={status}"
            )
            return

        entry = AuthAuditLog(
            user_id=user_id,
            event_type=event_type,
            status=status,
            reason_code=reason_code,
            request_id=request_id,
            route=route,
            method=method,
            ip_address=ip_address,
            user_agent=user_agent,
            message=message,
        )

        db_session.add(entry)
        await db_session.flush()

        audit_data = {
            "event": str(event_type),
            "status": str(status),
            "reason": str(reason_code or "N/A"),
            "user_id": str(user_id or "N/A"),
            "route": route,
            "method": method,
            "ip": ip_address,
            "req_id": request_id,
        }

        if status == AuthEventStatus.SUCCESS:
            logger.info("AUTH AUDIT SUCCESS: %s", audit_data)
        else:
            logger.warning("AUTH AUDIT FAIL: %s", audit_data)

    except Exception as exc:
        logger.exception("Failed to record auth audit log: %s", exc)
