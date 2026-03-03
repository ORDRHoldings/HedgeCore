"""
app/schemas/auth.py
Pydantic schemas for HedgeCalc authentication system.
Requests/Responses for auth flows. UserPublic is imported from app.schemas.user.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, EmailStr, constr

# Reuse the canonical public user schema (UUID id)
from app.schemas.user import UserPublic


# -------------------------------------------------------------------
# ? Request Schemas
# -------------------------------------------------------------------
class RegisterRequest(BaseModel):
    """Schema for user registration."""
    email: EmailStr = Field(..., description="User email address.")
    password: constr(min_length=8, max_length=128) = Field(
        ...,
        description="Plaintext password (will be hashed server-side).",
        examples=["StrongPassw0rd!"],
    )


class LoginRequest(BaseModel):
    """Schema for user login (JSON-based alternative to OAuth2 form)."""
    email: EmailStr = Field(..., description="User email address.")
    password: constr(min_length=8, max_length=128) = Field(
        ...,
        description="Plaintext password.",
    )


class TokenRefreshRequest(BaseModel):
    """Schema for token refresh requests."""
    refresh_token: constr(min_length=1) = Field(
        ...,
        description="Valid (unrevoked) refresh token string.",
    )


# Backward compatibility with earlier name
RefreshRequest = TokenRefreshRequest


# -------------------------------------------------------------------
# ?? Response Schemas
# -------------------------------------------------------------------
class TokenPair(BaseModel):
    """Returned after login or token refresh."""
    access_token: str = Field(..., description="JWT access token (Bearer).")
    refresh_token: str = Field(..., description="JWT refresh token.")
    token_type: Annotated[
        Literal["bearer"],
        Field(description="Token type for Authorization header.")
    ] = "bearer"
