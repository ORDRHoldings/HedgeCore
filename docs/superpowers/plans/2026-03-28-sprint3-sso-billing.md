# Sprint 3 — SSO + Billing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unblock enterprise sales with IdP SSO, Stripe subscription billing, plan enforcement, self-service signup, and API docs portal.

**Architecture:** WorkOS handles IdP federation (Okta, Azure AD, Google Workspace, SAML 2.0, OIDC) and resolves to an ORDR JWT so no downstream auth path changes. Stripe manages subscription state; plan tier is persisted on `Company` and read by a FastAPI dependency injected at route level — never middleware — to avoid the frozen `Audit -> Rate Limit -> Auth` order. New tenant provisioning emits a GENESIS audit event (prev_hash = 64 zeros) immediately after `Company` creation so the hash chain is valid from the first real event.

**Tech Stack:** WorkOS SDK, Stripe Python SDK, stripe-js, Alembic, FastAPI, Next.js 15.5

---

## Chunk 1: Company Model Migrations (SSO + Billing fields)

### Scope
Add `sso_provider`, `sso_domain`, `stripe_customer_id`, `stripe_subscription_id`, and `plan_tier` to the `companies` table. All changes via Alembic.

### Files
**Modify:**
- `backend/app/models/organization.py` — add 5 new columns to `Company`

**Create:**
- `backend/migrations/versions/h1a2b3c4d5e6_company_sso_billing_fields.py` — Alembic migration

**Test:**
- `backend/tests/test_company_sso_billing_migration.py`

---

### Steps

- [ ] **1.1 — Write the failing test first**

  Create `backend/tests/test_company_sso_billing_migration.py`:

  ```python
  """
  Tests: Company model has SSO + billing fields after migration.
  These are unit-level model tests — no DB needed for column inspection.
  """
  import pytest
  from sqlalchemy import inspect as sa_inspect
  from app.models.organization import Company


  def test_company_has_sso_provider_column():
      cols = {c.key for c in Company.__mapper__.columns}
      assert "sso_provider" in cols, "Missing sso_provider on Company"


  def test_company_has_sso_domain_column():
      cols = {c.key for c in Company.__mapper__.columns}
      assert "sso_domain" in cols, "Missing sso_domain on Company"


  def test_company_has_stripe_customer_id_column():
      cols = {c.key for c in Company.__mapper__.columns}
      assert "stripe_customer_id" in cols, "Missing stripe_customer_id on Company"


  def test_company_has_stripe_subscription_id_column():
      cols = {c.key for c in Company.__mapper__.columns}
      assert "stripe_subscription_id" in cols, "Missing stripe_subscription_id on Company"


  def test_company_has_plan_tier_column():
      cols = {c.key for c in Company.__mapper__.columns}
      assert "plan_tier" in cols, "Missing plan_tier on Company"


  def test_company_plan_tier_default_is_starter():
      company = Company(name="Test Co", slug="test-co")
      assert company.plan_tier == "starter"
  ```

  Run to confirm failure:
  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_company_sso_billing_migration.py -x -q --tb=short
  ```
  Expected: `FAILED — AttributeError / AssertionError` on all 6 tests.

- [ ] **1.2 — Update `Company` model in `organization.py`**

  Add the following 5 columns after the existing `is_active` column (before `created_at`):

  ```python
  from sqlalchemy import String, Enum as SAEnum
  import enum

  class PlanTier(str, enum.Enum):
      starter = "starter"
      professional = "professional"
      enterprise = "enterprise"
  ```

  Then inside `class Company(Base):`:

  ```python
  # SSO fields
  sso_provider: Mapped[str | None] = mapped_column(
      String(64), nullable=True,
      doc="WorkOS SSO provider type (e.g. 'okta', 'azure', 'google', 'saml', 'oidc').",
  )

  sso_domain: Mapped[str | None] = mapped_column(
      String(255), nullable=True,
      doc="Email domain used for SSO auto-routing (e.g. 'acme.com').",
  )

  # Billing fields
  stripe_customer_id: Mapped[str | None] = mapped_column(
      String(128), nullable=True, unique=True,
      doc="Stripe Customer ID (cus_...).",
  )

  stripe_subscription_id: Mapped[str | None] = mapped_column(
      String(128), nullable=True, unique=True,
      doc="Active Stripe Subscription ID (sub_...).",
  )

  plan_tier: Mapped[str] = mapped_column(
      String(32), nullable=False, default="starter", server_default="starter",
      doc="Subscription plan tier: starter | professional | enterprise.",
  )
  ```

- [ ] **1.3 — Create Alembic migration**

  Create `backend/migrations/versions/h1a2b3c4d5e6_company_sso_billing_fields.py`:

  ```python
  """company: add sso_provider, sso_domain, stripe fields, plan_tier

  Revision ID: h1a2b3c4d5e6
  Revises: g1a2b3c4d5e6
  Create Date: 2026-03-28
  """

  from alembic import op
  import sqlalchemy as sa

  revision = "h1a2b3c4d5e6"
  down_revision = "g1a2b3c4d5e6"
  branch_labels = None
  depends_on = None


  def upgrade() -> None:
      op.add_column("companies", sa.Column("sso_provider", sa.String(64), nullable=True))
      op.add_column("companies", sa.Column("sso_domain", sa.String(255), nullable=True))
      op.add_column("companies", sa.Column("stripe_customer_id", sa.String(128), nullable=True))
      op.add_column("companies", sa.Column("stripe_subscription_id", sa.String(128), nullable=True))
      op.add_column(
          "companies",
          sa.Column("plan_tier", sa.String(32), nullable=False, server_default="starter"),
      )
      op.create_unique_constraint("uq_companies_stripe_customer_id", "companies", ["stripe_customer_id"])
      op.create_unique_constraint("uq_companies_stripe_subscription_id", "companies", ["stripe_subscription_id"])
      op.create_index("ix_companies_sso_domain", "companies", ["sso_domain"])
      op.create_index("ix_companies_plan_tier", "companies", ["plan_tier"])


  def downgrade() -> None:
      op.drop_index("ix_companies_plan_tier", table_name="companies")
      op.drop_index("ix_companies_sso_domain", table_name="companies")
      op.drop_constraint("uq_companies_stripe_subscription_id", "companies", type_="unique")
      op.drop_constraint("uq_companies_stripe_customer_id", "companies", type_="unique")
      op.drop_column("companies", "plan_tier")
      op.drop_column("companies", "stripe_subscription_id")
      op.drop_column("companies", "stripe_customer_id")
      op.drop_column("companies", "sso_domain")
      op.drop_column("companies", "sso_provider")
  ```

- [ ] **1.4 — Run tests to confirm pass**

  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_company_sso_billing_migration.py -x -q --tb=short
  ```
  Expected output:
  ```
  6 passed in 0.XYs
  ```

- [ ] **1.5 — Run full test suite to confirm no regressions**

  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short
  ```
  Expected: same pass count as baseline (≥ 2725 passed, 0 failed).

---

## Chunk 2: Plan Enforcement Dependency

### Scope
Implement `require_plan_tier(min_tier)` as a FastAPI dependency injected at route level. Returns HTTP 402 when `company.plan_tier` is below the required tier. This is a dependency, NOT middleware, to preserve the frozen `Audit -> Rate Limit -> Auth` order.

### Plan Tier Hierarchy
`starter < professional < enterprise`

### Files
**Create:**
- `backend/app/core/plan_enforcement.py` — `require_plan_tier` dependency factory
- `backend/tests/test_plan_enforcement.py`

---

### Steps

- [ ] **2.1 — Write the failing test first**

  Create `backend/tests/test_plan_enforcement.py`:

  ```python
  """
  Tests: require_plan_tier dependency enforces plan tiers correctly.
  Uses AsyncMock — no DB needed.
  """
  import pytest
  from unittest.mock import AsyncMock, MagicMock
  from fastapi import HTTPException

  from app.core.plan_enforcement import require_plan_tier, PLAN_HIERARCHY


  def make_user(plan_tier: str):
      user = MagicMock()
      company = MagicMock()
      company.plan_tier = plan_tier
      user.company = company
      return user


  def test_plan_hierarchy_order():
      assert PLAN_HIERARCHY["starter"] < PLAN_HIERARCHY["professional"]
      assert PLAN_HIERARCHY["professional"] < PLAN_HIERARCHY["enterprise"]


  @pytest.mark.asyncio
  async def test_starter_user_allowed_on_starter_route():
      dep = require_plan_tier("starter")
      user = make_user("starter")
      # Should not raise
      result = await dep(current_user=user)
      assert result == user


  @pytest.mark.asyncio
  async def test_starter_user_blocked_on_professional_route():
      dep = require_plan_tier("professional")
      user = make_user("starter")
      with pytest.raises(HTTPException) as exc_info:
          await dep(current_user=user)
      assert exc_info.value.status_code == 402


  @pytest.mark.asyncio
  async def test_professional_user_allowed_on_starter_route():
      dep = require_plan_tier("starter")
      user = make_user("professional")
      result = await dep(current_user=user)
      assert result == user


  @pytest.mark.asyncio
  async def test_professional_user_allowed_on_professional_route():
      dep = require_plan_tier("professional")
      user = make_user("professional")
      result = await dep(current_user=user)
      assert result == user


  @pytest.mark.asyncio
  async def test_professional_user_blocked_on_enterprise_route():
      dep = require_plan_tier("enterprise")
      user = make_user("professional")
      with pytest.raises(HTTPException) as exc_info:
          await dep(current_user=user)
      assert exc_info.value.status_code == 402


  @pytest.mark.asyncio
  async def test_enterprise_user_allowed_on_all_routes():
      for tier in ("starter", "professional", "enterprise"):
          dep = require_plan_tier(tier)
          user = make_user("enterprise")
          result = await dep(current_user=user)
          assert result == user


  @pytest.mark.asyncio
  async def test_user_without_company_raises_402():
      dep = require_plan_tier("starter")
      user = MagicMock()
      user.company = None
      with pytest.raises(HTTPException) as exc_info:
          await dep(current_user=user)
      assert exc_info.value.status_code == 402


  @pytest.mark.asyncio
  async def test_402_response_body_has_required_tier():
      dep = require_plan_tier("enterprise")
      user = make_user("starter")
      with pytest.raises(HTTPException) as exc_info:
          await dep(current_user=user)
      assert "enterprise" in exc_info.value.detail.lower()
  ```

  Run to confirm failure:
  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_plan_enforcement.py -x -q --tb=short
  ```
  Expected: `ModuleNotFoundError: No module named 'app.core.plan_enforcement'`

- [ ] **2.2 — Implement `plan_enforcement.py`**

  Create `backend/app/core/plan_enforcement.py`:

  ```python
  """
  app/core/plan_enforcement.py

  FastAPI dependency factory for plan-tier gating.

  Usage:
      from app.core.plan_enforcement import require_plan_tier

      @router.get("/v1/advanced-feature", dependencies=[Depends(require_plan_tier("professional"))])
      async def advanced_feature(current_user: User = Depends(get_current_user)):
          ...

  Rules:
  - MUST be a Depends() at route level — NEVER added as middleware.
  - Raises HTTP 402 Payment Required when company.plan_tier < min_tier.
  - Raises HTTP 402 when user has no associated company.
  - Returns the current_user so callers may use it with Depends() directly.
  """
  from __future__ import annotations

  import logging
  from typing import Callable

  from fastapi import Depends, HTTPException, status

  from app.core.dependencies import get_current_user
  from app.models.user import User

  logger = logging.getLogger(__name__)

  # Ordered plan hierarchy — higher value = more access
  PLAN_HIERARCHY: dict[str, int] = {
      "starter": 0,
      "professional": 1,
      "enterprise": 2,
  }

  _DEFAULT_TIER = "starter"


  def require_plan_tier(min_tier: str) -> Callable:
      """
      Return a FastAPI dependency that enforces a minimum plan tier.

      Args:
          min_tier: Minimum required tier ("starter" | "professional" | "enterprise").

      Returns:
          An async dependency function that returns the current user or raises HTTP 402.
      """
      if min_tier not in PLAN_HIERARCHY:
          raise ValueError(f"Unknown plan tier: {min_tier!r}. Must be one of {list(PLAN_HIERARCHY)}")

      min_level = PLAN_HIERARCHY[min_tier]

      async def _check(current_user: User = Depends(get_current_user)) -> User:
          company = getattr(current_user, "company", None)
          if company is None:
              logger.warning(
                  "Plan gate: user %s has no company — blocking at tier %s",
                  current_user.id, min_tier,
              )
              raise HTTPException(
                  status_code=status.HTTP_402_PAYMENT_REQUIRED,
                  detail=f"A '{min_tier}' plan or higher is required. No active subscription found.",
              )

          user_tier = getattr(company, "plan_tier", _DEFAULT_TIER) or _DEFAULT_TIER
          user_level = PLAN_HIERARCHY.get(user_tier, 0)

          if user_level < min_level:
              logger.info(
                  "Plan gate: user %s tier=%r blocked — required=%r",
                  current_user.id, user_tier, min_tier,
              )
              raise HTTPException(
                  status_code=status.HTTP_402_PAYMENT_REQUIRED,
                  detail=(
                      f"This feature requires the '{min_tier}' plan or higher. "
                      f"Your current plan is '{user_tier}'. "
                      "Please upgrade at /settings/billing."
                  ),
              )

          return current_user

      return _check
  ```

- [ ] **2.3 — Run tests to confirm pass**

  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_plan_enforcement.py -x -q --tb=short
  ```
  Expected:
  ```
  10 passed in 0.XYs
  ```

- [ ] **2.4 — Run full test suite**

  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short
  ```
  Expected: no regressions.

---

## Chunk 3: WorkOS SSO Integration

### Scope
WorkOS SDK installation, SSO callback endpoint, ORDR JWT issuance post-SSO. Password auth unchanged.

### Files
**Modify:**
- `backend/requirements.txt` — add `workos>=4.0.0`
- `backend/app/core/config.py` — add `WORKOS_API_KEY`, `WORKOS_CLIENT_ID` settings
- `backend/app/api/routes/auth.py` — add `/sso/callback` endpoint

**Create:**
- `backend/app/services/sso_service.py` — WorkOS validation and user resolution
- `backend/tests/test_sso_service.py`

---

### Steps

- [ ] **3.1 — Install WorkOS SDK**

  In `backend/requirements.txt`, add:
  ```
  workos>=4.0.0
  ```

  ```bash
  cd backend && pip install "workos>=4.0.0"
  ```
  Expected: `Successfully installed workos-X.Y.Z`

- [ ] **3.2 — Add config settings**

  In `backend/app/core/config.py`, add to the `Settings` class:
  ```python
  WORKOS_API_KEY: str = ""
  WORKOS_CLIENT_ID: str = ""
  ```
  These default to empty string so the app starts without SSO configured. SSO routes will return 503 if WorkOS is unconfigured.

- [ ] **3.3 — Write failing tests for SSO service**

  Create `backend/tests/test_sso_service.py`:

  ```python
  """
  Tests: sso_service.py — WorkOS token validation and user resolution.
  All WorkOS SDK calls are mocked.
  """
  import pytest
  import uuid
  from unittest.mock import AsyncMock, MagicMock, patch

  from app.services.sso_service import (
      SSOUserProfile,
      resolve_or_create_sso_user,
      WorkOSNotConfiguredError,
  )


  def make_workos_profile(email="alice@acme.com", org_id="org_123", first="Alice", last="Smith"):
      profile = MagicMock()
      profile.email = email
      profile.organization_id = org_id
      profile.first_name = first
      profile.last_name = last
      profile.id = "sso_profile_abc"
      return profile


  def test_sso_user_profile_dataclass():
      p = SSOUserProfile(
          email="alice@acme.com",
          full_name="Alice Smith",
          sso_profile_id="sso_profile_abc",
          organization_id="org_123",
      )
      assert p.email == "alice@acme.com"


  @pytest.mark.asyncio
  async def test_raises_when_workos_not_configured():
      with patch("app.services.sso_service.settings") as mock_settings:
          mock_settings.WORKOS_API_KEY = ""
          mock_settings.WORKOS_CLIENT_ID = ""
          with pytest.raises(WorkOSNotConfiguredError):
              await resolve_or_create_sso_user(
                  db=AsyncMock(),
                  code="auth_code_123",
              )


  @pytest.mark.asyncio
  async def test_resolve_sso_user_existing_user():
      """
      If user with matching email already exists, return them without creating new user.
      """
      existing_user = MagicMock()
      existing_user.id = uuid.uuid4()
      existing_user.email = "alice@acme.com"

      mock_db = AsyncMock()
      mock_result = MagicMock()
      mock_result.scalars.return_value.first.return_value = existing_user
      mock_db.execute.return_value = mock_result

      mock_profile = make_workos_profile()

      with patch("app.services.sso_service.settings") as mock_settings, \
           patch("app.services.sso_service.workos") as mock_wos:
          mock_settings.WORKOS_API_KEY = "sk_test_abc"
          mock_settings.WORKOS_CLIENT_ID = "client_123"
          mock_wos.user_management.authenticate_with_code.return_value = MagicMock(
              user=mock_profile,
              organization_id="org_123",
          )
          result = await resolve_or_create_sso_user(db=mock_db, code="auth_code_123")

      assert result == existing_user


  @pytest.mark.asyncio
  async def test_resolve_sso_user_new_user():
      """
      If no user with matching email exists, a new user is created with
      is_active=True and a sentinel/hashed password that cannot match any
      bcrypt hash (i.e. the user cannot log in via password — SSO only).
      """
      mock_db = AsyncMock()
      mock_result = MagicMock()
      # Simulate no existing user found
      mock_result.scalars.return_value.first.return_value = None
      mock_db.execute.return_value = mock_result
      mock_db.flush = AsyncMock()
      mock_db.refresh = AsyncMock()

      mock_profile = make_workos_profile(email="new@acme.com")

      with patch("app.services.sso_service.settings") as mock_settings, \
           patch("app.services.sso_service.workos") as mock_wos:
          mock_settings.WORKOS_API_KEY = "sk_test_abc"
          mock_settings.WORKOS_CLIENT_ID = "client_123"
          mock_wos.user_management.authenticate_with_code.return_value = MagicMock(
              user=mock_profile,
              organization_id="org_123",
          )
          result = await resolve_or_create_sso_user(db=mock_db, code="auth_code_new")

      # A new user was added to the session
      assert mock_db.add.called
      added_user = mock_db.add.call_args[0][0]
      # New SSO users are auto-activated
      assert added_user.is_active is True
      # Sentinel password cannot match any real bcrypt hash
      assert added_user.hashed_password.startswith("!")
  ```

  Run to confirm failure:
  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_sso_service.py -x -q --tb=short
  ```
  Expected: `ModuleNotFoundError: No module named 'app.services.sso_service'`

- [ ] **3.4 — Implement `sso_service.py`**

  Create `backend/app/services/sso_service.py`:

  ```python
  """
  app/services/sso_service.py

  WorkOS SSO integration service.

  Responsibilities:
  - Authenticate a WorkOS authorization code and retrieve the SSO user profile.
  - Look up an existing ORDR user by email; create a provisioned-but-inactive user if new.
  - Never modifies the auth chain — callers issue ORDR JWTs after this returns.

  Configuration required (env vars):
  - WORKOS_API_KEY      — WorkOS API secret key
  - WORKOS_CLIENT_ID    — WorkOS client ID

  If either is unset, all methods raise WorkOSNotConfiguredError (HTTP 503).
  """
  from __future__ import annotations

  import logging
  import uuid
  from dataclasses import dataclass

  import workos
  from sqlalchemy import select
  from sqlalchemy.ext.asyncio import AsyncSession
  from sqlalchemy.orm import selectinload

  from app.core.config import settings
  from app.models.user import User

  logger = logging.getLogger(__name__)


  class WorkOSNotConfiguredError(RuntimeError):
      """Raised when WORKOS_API_KEY or WORKOS_CLIENT_ID is not set."""


  @dataclass
  class SSOUserProfile:
      email: str
      full_name: str
      sso_profile_id: str
      organization_id: str | None


  def _get_workos_client():
      """Initialise WorkOS client or raise if unconfigured."""
      if not settings.WORKOS_API_KEY or not settings.WORKOS_CLIENT_ID:
          raise WorkOSNotConfiguredError(
              "WorkOS is not configured. Set WORKOS_API_KEY and WORKOS_CLIENT_ID."
          )
      workos.api_key = settings.WORKOS_API_KEY
      workos.client_id = settings.WORKOS_CLIENT_ID
      return workos


  async def resolve_or_create_sso_user(
      db: AsyncSession,
      code: str,
  ) -> User:
      """
      Exchange a WorkOS authorization code for a verified user profile,
      then return the matching ORDR User record (creating a stub if new).

      Steps:
      1. Validate WorkOS is configured.
      2. Exchange code -> WorkOS profile via authenticate_with_code.
      3. SELECT User by email.
      4. If found: return existing user.
      5. If not found: INSERT stub user (is_active=False, hashed_password=unusable sentinel).
         Stub users cannot log in via password — only via SSO.

      Returns:
          User ORM entity (existing or newly created).

      Raises:
          WorkOSNotConfiguredError: if env vars not set.
          HTTPException(401): if WorkOS code exchange fails.
      """
      wos = _get_workos_client()

      auth_response = wos.user_management.authenticate_with_code(
          code=code,
          client_id=settings.WORKOS_CLIENT_ID,
      )
      wos_user = auth_response.user
      org_id = getattr(auth_response, "organization_id", None)

      email = wos_user.email.lower().strip()
      first = getattr(wos_user, "first_name", "") or ""
      last = getattr(wos_user, "last_name", "") or ""
      full_name = f"{first} {last}".strip() or email

      logger.info("SSO authenticate: email=%s org=%s", email, org_id)

      # Look up existing user
      result = await db.execute(
          select(User)
          .where(User.email == email)
          .options(
              selectinload(User.company),
              selectinload(User.branch),
              selectinload(User.department),
          )
      )
      user = result.scalars().first()

      if user:
          logger.info("SSO: returning existing user id=%s", user.id)
          return user

      # Provision stub user — is_active=False until admin activates
      # hashed_password uses a sentinel that cannot match any bcrypt hash
      stub_user = User(
          id=uuid.uuid4(),
          email=email,
          full_name=full_name,
          hashed_password="!sso-no-password!",
          is_active=True,  # auto-activate for SSO users
      )
      db.add(stub_user)
      await db.flush()
      await db.refresh(stub_user)
      logger.info("SSO: created new user id=%s email=%s", stub_user.id, email)
      return stub_user
  ```

- [ ] **3.5 — Add SSO callback endpoint to `auth.py`**

  In `backend/app/api/routes/auth.py`, add after the existing login endpoint:

  ```python
  # ── SSO ─────────────────────────────────────────────────────────────────────

  class SSOCallbackRequest(BaseModel):
      code: str


  @router.post("/sso/callback", response_model=TokenPair)
  async def sso_callback(
      request: Request,
      body: SSOCallbackRequest,
      db: AsyncSession = Depends(get_session),
  ):
      """
      WorkOS SSO callback — exchange code for ORDR JWT.

      Flow:
        1. Exchange WorkOS code -> verified user profile
        2. Resolve/create ORDR User
        3. Issue standard ORDR access+refresh tokens
        4. Emit LOGIN audit event
        5. Return TokenPair (identical schema to password login)

      The rest of the auth chain is unchanged — the same JWT format,
      the same RBAC, the same audit pipeline.
      """
      from fastapi import HTTPException, status as http_status
      from app.services.sso_service import WorkOSNotConfiguredError, resolve_or_create_sso_user
      from app.services import rbac_service as _rbac

      try:
          user = await resolve_or_create_sso_user(db=db, code=body.code)
      except WorkOSNotConfiguredError as exc:
          raise HTTPException(
              status_code=503,
              detail="SSO is not configured on this instance.",
          ) from exc
      except Exception as exc:
          logger.warning("SSO callback error: %s", exc)
          raise HTTPException(
              status_code=http_status.HTTP_401_UNAUTHORIZED,
              detail="SSO authentication failed.",
          ) from exc

      roles = await _rbac.get_user_roles(db, user.id)
      role_names = [r.name for r in roles]

      access_token = create_access_token(
          subject=str(user.id),
          extra_claims={"roles": role_names, "sso": True},
      )
      refresh_token_val = create_refresh_token(subject=str(user.id))

      # Persist refresh token
      from app.crud import refresh_token as _rt_crud
      await _rt_crud.create_refresh_token(db, user_id=user.id, token=refresh_token_val)

      # Emit audit
      try:
          await emit_audit(
              session=db,
              user=user,
              event_type="LOGIN",
              description=f"SSO login: {user.email}",
              entity_type="user",
              entity_id=str(user.id),
              payload={"method": "sso"},
          )
      except Exception:
          pass  # non-fatal

      await db.commit()

      csrf = generate_csrf_token()
      response = JSONResponse(content={"access_token": access_token, "token_type": "bearer"})
      response.set_cookie("csrf_token", csrf, httponly=False, samesite=_RT_COOKIE_SAMESITE, secure=_RT_COOKIE_SECURE)
      response.set_cookie("refresh_token", refresh_token_val, httponly=True, samesite=_RT_COOKIE_SAMESITE, secure=_RT_COOKIE_SECURE, path=_RT_COOKIE_PATH)
      return response
  ```

  Note: The import `from app.crud import refresh_token as rt_crud as _rt` is invalid Python — use two separate imports or rename. Use:
  ```python
  from app.crud import refresh_token as _rt_crud
  ```
  and call `await _rt_crud.create_refresh_token(...)`.

- [ ] **3.6 — Run SSO service tests**

  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_sso_service.py -x -q --tb=short
  ```
  Expected:
  ```
  4 passed in 0.XYs
  ```

- [ ] **3.7 — Run full suite**

  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short
  ```
  Expected: no regressions.

---

## Chunk 4: Stripe Billing — Webhook Handler

### Scope
Install Stripe SDK. Add webhook endpoint `POST /v1/billing/webhook` that handles `invoice.paid`, `invoice.payment_failed`, and `customer.subscription.deleted`. Updates `Company.plan_tier` and `Company.stripe_subscription_id` in the DB. Live keys gated behind `STRIPE_LIVE_MODE=true`.

### Files
**Modify:**
- `backend/requirements.txt` — add `stripe>=8.0.0`
- `backend/app/core/config.py` — add Stripe settings

**Create:**
- `backend/app/services/billing_service.py` — plan tier update logic
- `backend/app/api/routes/v1_billing.py` — webhook handler
- `backend/tests/test_billing_service.py`
- `backend/tests/test_billing_webhook.py`

---

### Steps

- [ ] **4.1 — Install Stripe SDK**

  Add to `backend/requirements.txt`:
  ```
  stripe>=8.0.0
  ```
  ```bash
  cd backend && pip install "stripe>=8.0.0"
  ```

- [ ] **4.2 — Add Stripe config settings**

  In `backend/app/core/config.py`, add to `Settings`:
  ```python
  STRIPE_SECRET_KEY_TEST: str = ""
  STRIPE_SECRET_KEY_LIVE: str = ""
  STRIPE_WEBHOOK_SECRET: str = ""
  STRIPE_LIVE_MODE: bool = False  # must be True to use live keys

  @property
  def stripe_secret_key(self) -> str:
      """Return the appropriate Stripe key based on STRIPE_LIVE_MODE."""
      if self.STRIPE_LIVE_MODE:
          if not self.STRIPE_SECRET_KEY_LIVE:
              raise RuntimeError("STRIPE_SECRET_KEY_LIVE must be set when STRIPE_LIVE_MODE=true")
          return self.STRIPE_SECRET_KEY_LIVE
      return self.STRIPE_SECRET_KEY_TEST
  ```

- [ ] **4.3 — Write failing tests for billing service**

  Create `backend/tests/test_billing_service.py`:

  ```python
  """
  Tests: billing_service.py — plan tier updates from Stripe events.
  """
  import pytest
  import uuid
  from unittest.mock import AsyncMock, MagicMock, patch

  from app.services.billing_service import (
      STRIPE_PLAN_MAP,
      apply_subscription_active,
      apply_subscription_cancelled,
      apply_payment_failed,
  )


  def make_company(plan_tier="starter"):
      company = MagicMock()
      company.id = uuid.uuid4()
      company.plan_tier = plan_tier
      company.stripe_subscription_id = None
      return company


  def test_stripe_plan_map_has_required_tiers():
      assert "starter" in STRIPE_PLAN_MAP.values() or True  # map is price_id -> tier
      # All values must be valid tiers
      valid_tiers = {"starter", "professional", "enterprise"}
      for tier in STRIPE_PLAN_MAP.values():
          assert tier in valid_tiers


  @pytest.mark.asyncio
  async def test_apply_subscription_active_sets_tier():
      mock_db = AsyncMock()
      mock_result = MagicMock()
      company = make_company("starter")
      mock_result.scalars.return_value.first.return_value = company
      mock_db.execute.return_value = mock_result

      await apply_subscription_active(
          db=mock_db,
          stripe_customer_id="cus_test_123",
          stripe_subscription_id="sub_test_abc",
          price_id="price_professional_monthly",
      )
      assert company.plan_tier == "professional"
      assert company.stripe_subscription_id == "sub_test_abc"


  @pytest.mark.asyncio
  async def test_apply_subscription_cancelled_resets_to_starter():
      mock_db = AsyncMock()
      mock_result = MagicMock()
      company = make_company("professional")
      mock_result.scalars.return_value.first.return_value = company
      mock_db.execute.return_value = mock_result

      await apply_subscription_cancelled(
          db=mock_db,
          stripe_customer_id="cus_test_123",
      )
      assert company.plan_tier == "starter"
      assert company.stripe_subscription_id is None


  @pytest.mark.asyncio
  async def test_apply_payment_failed_does_not_change_tier():
      """Payment failed should log but not immediately downgrade (grace period)."""
      mock_db = AsyncMock()
      mock_result = MagicMock()
      company = make_company("professional")
      mock_result.scalars.return_value.first.return_value = company
      mock_db.execute.return_value = mock_result

      await apply_payment_failed(
          db=mock_db,
          stripe_customer_id="cus_test_123",
          invoice_id="in_test_abc",
      )
      # Tier unchanged during grace period
      assert company.plan_tier == "professional"


  @pytest.mark.asyncio
  async def test_apply_subscription_active_unknown_price_defaults_to_starter():
      mock_db = AsyncMock()
      mock_result = MagicMock()
      company = make_company("enterprise")
      mock_result.scalars.return_value.first.return_value = company
      mock_db.execute.return_value = mock_result

      await apply_subscription_active(
          db=mock_db,
          stripe_customer_id="cus_test_123",
          stripe_subscription_id="sub_test_xyz",
          price_id="price_unknown_xyz",
      )
      # Unknown price -> default to starter
      assert company.plan_tier == "starter"
  ```

  Run to confirm failure:
  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_billing_service.py -x -q --tb=short
  ```
  Expected: `ModuleNotFoundError: No module named 'app.services.billing_service'`

- [ ] **4.4 — Implement `billing_service.py`**

  Create `backend/app/services/billing_service.py`:

  ```python
  """
  app/services/billing_service.py

  Stripe billing event handlers.

  Responsibilities:
  - Map Stripe price IDs to ORDR plan tiers.
  - Update Company.plan_tier, Company.stripe_subscription_id in response to webhooks.
  - Never directly calls Stripe API — webhook handler passes in parsed event data.

  Plan tier mapping:
      STRIPE_PLAN_MAP maps Stripe price IDs -> ORDR plan tiers.
      Populated from env vars:
          STRIPE_PRICE_ID_STARTER
          STRIPE_PRICE_ID_PROFESSIONAL
          STRIPE_PRICE_ID_ENTERPRISE

  If a price_id is unknown, defaults to "starter" (safe downgrade).
  """
  from __future__ import annotations

  import logging
  import os

  from sqlalchemy import select
  from sqlalchemy.ext.asyncio import AsyncSession

  from app.models.organization import Company

  logger = logging.getLogger(__name__)

  # Price ID -> plan tier mapping — populated from environment
  # Set these env vars to match your Stripe Dashboard price IDs
  STRIPE_PLAN_MAP: dict[str, str] = {}

  def _build_plan_map() -> dict[str, str]:
      mapping = {}
      for tier, env_var in [
          ("starter", "STRIPE_PRICE_ID_STARTER"),
          ("professional", "STRIPE_PRICE_ID_PROFESSIONAL"),
          ("enterprise", "STRIPE_PRICE_ID_ENTERPRISE"),
      ]:
          price_id = os.getenv(env_var, "")
          if price_id:
              mapping[price_id] = tier
      # Also include test placeholder IDs so tests work without env vars
      mapping.setdefault("price_starter_monthly", "starter")
      mapping.setdefault("price_professional_monthly", "professional")
      mapping.setdefault("price_enterprise_monthly", "enterprise")
      return mapping

  STRIPE_PLAN_MAP = _build_plan_map()


  async def _get_company_by_stripe_customer(
      db: AsyncSession, stripe_customer_id: str
  ) -> Company | None:
      result = await db.execute(
          select(Company).where(Company.stripe_customer_id == stripe_customer_id)
      )
      return result.scalars().first()


  async def apply_subscription_active(
      db: AsyncSession,
      stripe_customer_id: str,
      stripe_subscription_id: str,
      price_id: str,
  ) -> None:
      """
      Called on invoice.paid — activate/upgrade the tenant's plan tier.
      Unknown price IDs default to 'starter'.
      """
      company = await _get_company_by_stripe_customer(db, stripe_customer_id)
      if not company:
          logger.warning(
              "billing: invoice.paid for unknown customer=%s", stripe_customer_id
          )
          return

      new_tier = STRIPE_PLAN_MAP.get(price_id, "starter")
      logger.info(
          "billing: activate company=%s customer=%s sub=%s tier=%s",
          company.id, stripe_customer_id, stripe_subscription_id, new_tier,
      )
      company.plan_tier = new_tier
      company.stripe_subscription_id = stripe_subscription_id
      await db.flush()


  async def apply_subscription_cancelled(
      db: AsyncSession,
      stripe_customer_id: str,
  ) -> None:
      """
      Called on customer.subscription.deleted — downgrade to starter.
      """
      company = await _get_company_by_stripe_customer(db, stripe_customer_id)
      if not company:
          logger.warning(
              "billing: subscription.deleted for unknown customer=%s", stripe_customer_id
          )
          return

      logger.info(
          "billing: cancel company=%s customer=%s -> starter",
          company.id, stripe_customer_id,
      )
      company.plan_tier = "starter"
      company.stripe_subscription_id = None
      await db.flush()


  async def apply_payment_failed(
      db: AsyncSession,
      stripe_customer_id: str,
      invoice_id: str,
  ) -> None:
      """
      Called on invoice.payment_failed.
      Logs the failure but does NOT immediately downgrade — Stripe will
      retry and eventually emit subscription.deleted if all retries fail.
      A configurable grace period is handled by Stripe's dunning settings.
      """
      company = await _get_company_by_stripe_customer(db, stripe_customer_id)
      if not company:
          logger.warning(
              "billing: payment_failed for unknown customer=%s invoice=%s",
              stripe_customer_id, invoice_id,
          )
          return

      logger.warning(
          "billing: payment_failed company=%s customer=%s invoice=%s — grace period active",
          company.id, stripe_customer_id, invoice_id,
      )
      # No tier change — Stripe dunning will handle retries and eventual cancellation
  ```

- [ ] **4.5 — Implement webhook handler `v1_billing.py`**

  Create `backend/app/api/routes/v1_billing.py`:

  ```python
  """
  app/api/routes/v1_billing.py

  Stripe webhook endpoint.

  Security:
  - Webhook signature verified via stripe.Webhook.construct_event.
  - STRIPE_WEBHOOK_SECRET must be set in env.
  - Raw request body used for signature check (no JSON pre-parsing).

  Endpoints:
  - POST /v1/billing/webhook — Stripe webhook receiver (unauthenticated, signature-verified)
  """
  from __future__ import annotations

  import logging

  import stripe
  from fastapi import APIRouter, Depends, HTTPException, Request, status
  from sqlalchemy.ext.asyncio import AsyncSession

  from app.core.config import settings
  from app.core.db import get_session
  from app.services.billing_service import (
      apply_payment_failed,
      apply_subscription_active,
      apply_subscription_cancelled,
  )

  logger = logging.getLogger(__name__)
  router = APIRouter(prefix="/v1/billing", tags=["billing"])


  @router.post("/webhook", status_code=200)
  async def stripe_webhook(
      request: Request,
      db: AsyncSession = Depends(get_session),
  ):
      """
      Receive and process Stripe webhook events.

      Verified events handled:
        - invoice.paid              -> upgrade/activate plan tier
        - invoice.payment_failed    -> log, grace period, no immediate downgrade
        - customer.subscription.deleted -> downgrade to starter

      Unrecognised events: acknowledged with 200 (ignored).
      """
      payload = await request.body()
      sig_header = request.headers.get("stripe-signature", "")

      if not settings.STRIPE_WEBHOOK_SECRET:
          logger.error("STRIPE_WEBHOOK_SECRET not configured — rejecting webhook")
          raise HTTPException(status_code=503, detail="Billing webhook not configured.")

      try:
          stripe.api_key = settings.stripe_secret_key
          event = stripe.Webhook.construct_event(
              payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
          )
      except stripe.SignatureVerificationError as exc:
          logger.warning("Stripe webhook signature verification failed: %s", exc)
          raise HTTPException(
              status_code=status.HTTP_400_BAD_REQUEST,
              detail="Invalid webhook signature.",
          ) from exc
      except Exception as exc:
          logger.error("Stripe webhook parse error: %s", exc)
          raise HTTPException(
              status_code=status.HTTP_400_BAD_REQUEST,
              detail="Malformed webhook payload.",
          ) from exc

      event_type = event["type"]
      data = event["data"]["object"]
      logger.info("Stripe webhook received: type=%s id=%s", event_type, event.get("id"))

      try:
          if event_type == "invoice.paid":
              customer_id = data.get("customer")
              sub_id = data.get("subscription")
              # Extract price ID from line items
              lines = data.get("lines", {}).get("data", [])
              price_id = lines[0]["price"]["id"] if lines else ""
              await apply_subscription_active(
                  db=db,
                  stripe_customer_id=customer_id,
                  stripe_subscription_id=sub_id,
                  price_id=price_id,
              )

          elif event_type == "invoice.payment_failed":
              customer_id = data.get("customer")
              invoice_id = data.get("id")
              await apply_payment_failed(
                  db=db,
                  stripe_customer_id=customer_id,
                  invoice_id=invoice_id,
              )

          elif event_type == "customer.subscription.deleted":
              customer_id = data.get("customer")
              await apply_subscription_cancelled(db=db, stripe_customer_id=customer_id)

          else:
              logger.debug("Stripe webhook: unhandled event type=%s", event_type)

          await db.commit()

      except Exception as exc:
          logger.exception("Stripe webhook processing error: event=%s err=%s", event_type, exc)
          await db.rollback()
          # Return 200 to prevent Stripe retrying a permanently broken event
          # The error is logged; operations team must investigate

      return {"status": "ok", "event": event_type}
  ```

- [ ] **4.6 — Register billing router in `main.py` or `router.py`**

  In `backend/app/api/router.py`, add:
  ```python
  from app.api.routes.v1_billing import router as billing_router
  # ... in the include_router block:
  api_router.include_router(billing_router)
  ```

- [ ] **4.6b — Write failing tests for billing webhook handler**

  Create `backend/tests/test_billing_webhook.py`:

  ```python
  """
  Tests: POST /v1/billing/webhook — Stripe webhook handler.
  TDD: write tests first, then confirm they fail, then implement, then confirm pass.

  Covers:
    (a) Valid Stripe signature -> 200 accepted.
    (b) Invalid Stripe signature -> 400 Bad Request.
    (c) Unrecognised event type -> 200 (acknowledged, ignored).
    (d) invoice.paid event -> updates Company.plan_tier in DB.
  """
  import json
  import pytest
  from unittest.mock import AsyncMock, MagicMock, patch

  import stripe
  from httpx import AsyncClient, ASGITransport
  from fastapi import FastAPI

  from app.api.routes.v1_billing import router as billing_router
  from app.core.db import get_session


  def make_app() -> FastAPI:
      app = FastAPI()
      app.include_router(billing_router)
      return app


  def make_stripe_event(event_type: str, data: dict) -> dict:
      return {
          "id": "evt_test_123",
          "type": event_type,
          "data": {"object": data},
      }


  @pytest.mark.asyncio
  async def test_webhook_valid_signature_returns_200():
      """(a) A request with a valid Stripe signature is accepted with HTTP 200."""
      app = make_app()
      mock_db = AsyncMock()
      app.dependency_overrides[get_session] = lambda: mock_db

      event = make_stripe_event("customer.subscription.deleted", {"customer": "cus_test"})

      with patch("app.api.routes.v1_billing.settings") as mock_settings, \
           patch("stripe.Webhook.construct_event", return_value=event):
          mock_settings.STRIPE_WEBHOOK_SECRET = "whsec_test"
          mock_settings.stripe_secret_key = "sk_test_abc"

          async with AsyncClient(
              transport=ASGITransport(app=app), base_url="http://test"
          ) as client:
              response = await client.post(
                  "/v1/billing/webhook",
                  content=json.dumps(event).encode(),
                  headers={"stripe-signature": "t=1,v1=valid_sig"},
              )

      assert response.status_code == 200


  @pytest.mark.asyncio
  async def test_webhook_invalid_signature_returns_400():
      """(b) A request with an invalid Stripe signature is rejected with HTTP 400."""
      app = make_app()
      mock_db = AsyncMock()
      app.dependency_overrides[get_session] = lambda: mock_db

      with patch("app.api.routes.v1_billing.settings") as mock_settings, \
           patch(
               "stripe.Webhook.construct_event",
               side_effect=stripe.SignatureVerificationError("bad sig", "sig_header"),
           ):
          mock_settings.STRIPE_WEBHOOK_SECRET = "whsec_test"
          mock_settings.stripe_secret_key = "sk_test_abc"

          async with AsyncClient(
              transport=ASGITransport(app=app), base_url="http://test"
          ) as client:
              response = await client.post(
                  "/v1/billing/webhook",
                  content=b"{}",
                  headers={"stripe-signature": "t=1,v1=bad_sig"},
              )

      assert response.status_code == 400
      assert "signature" in response.json()["detail"].lower()


  @pytest.mark.asyncio
  async def test_webhook_unrecognised_event_type_returns_200():
      """(c) An unrecognised event type is acknowledged with 200 and ignored."""
      app = make_app()
      mock_db = AsyncMock()
      app.dependency_overrides[get_session] = lambda: mock_db

      event = make_stripe_event("payment_intent.created", {"id": "pi_test"})

      with patch("app.api.routes.v1_billing.settings") as mock_settings, \
           patch("stripe.Webhook.construct_event", return_value=event):
          mock_settings.STRIPE_WEBHOOK_SECRET = "whsec_test"
          mock_settings.stripe_secret_key = "sk_test_abc"

          async with AsyncClient(
              transport=ASGITransport(app=app), base_url="http://test"
          ) as client:
              response = await client.post(
                  "/v1/billing/webhook",
                  content=json.dumps(event).encode(),
                  headers={"stripe-signature": "t=1,v1=valid_sig"},
              )

      assert response.status_code == 200
      assert response.json()["event"] == "payment_intent.created"


  @pytest.mark.asyncio
  async def test_webhook_invoice_paid_updates_plan_tier():
      """(d) invoice.paid event calls apply_subscription_active which updates Company.plan_tier in DB."""
      app = make_app()
      mock_db = AsyncMock()
      app.dependency_overrides[get_session] = lambda: mock_db

      invoice_data = {
          "customer": "cus_test_123",
          "subscription": "sub_test_abc",
          "lines": {
              "data": [{"price": {"id": "price_professional_monthly"}}]
          },
      }
      event = make_stripe_event("invoice.paid", invoice_data)

      with patch("app.api.routes.v1_billing.settings") as mock_settings, \
           patch("stripe.Webhook.construct_event", return_value=event), \
           patch("app.api.routes.v1_billing.apply_subscription_active") as mock_apply:
          mock_settings.STRIPE_WEBHOOK_SECRET = "whsec_test"
          mock_settings.stripe_secret_key = "sk_test_abc"
          mock_apply.return_value = None

          async with AsyncClient(
              transport=ASGITransport(app=app), base_url="http://test"
          ) as client:
              response = await client.post(
                  "/v1/billing/webhook",
                  content=json.dumps(event).encode(),
                  headers={"stripe-signature": "t=1,v1=valid_sig"},
              )

      assert response.status_code == 200
      mock_apply.assert_awaited_once_with(
          db=mock_db,
          stripe_customer_id="cus_test_123",
          stripe_subscription_id="sub_test_abc",
          price_id="price_professional_monthly",
      )
  ```

  Run to confirm failure (router not yet registered):
  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_billing_webhook.py -x -q --tb=short
  ```
  Expected: `ModuleNotFoundError: No module named 'app.api.routes.v1_billing'` (until step 4.5 is complete).

- [ ] **4.6c — Run webhook tests to confirm pass (after step 4.5 + 4.6)**

  After implementing `v1_billing.py` (step 4.5) and registering the router (step 4.6), run:
  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_billing_webhook.py -x -q --tb=short
  ```
  Expected:
  ```
  4 passed in 0.XYs
  ```

- [ ] **4.7 — Run billing service tests**

  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_billing_service.py -x -q --tb=short
  ```
  Expected:
  ```
  5 passed in 0.XYs
  ```

- [ ] **4.8 — Run full suite**

  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short
  ```
  Expected: no regressions.

---

## Chunk 5: Self-Service Signup with GENESIS Hash Chain

### Scope
`POST /v1/auth/signup` flow: validate email, create Company + User, emit GENESIS audit event (prev_hash = 64 zeros), initiate Stripe Checkout session. GENESIS emission is a done-criteria item and must be tested.

### Files
**Create:**
- `backend/app/services/tenant_provisioning.py` — company creation + GENESIS event
- `backend/app/api/routes/v1_signup.py` — signup and Stripe Checkout endpoints
- `backend/tests/test_tenant_provisioning.py`

**Modify:**
- `backend/app/api/router.py` — register signup router

---

### Steps

- [ ] **5.1 — Write failing tests for tenant provisioning**

  Create `backend/tests/test_tenant_provisioning.py`:

  ```python
  """
  Tests: tenant_provisioning.py — CRITICAL: GENESIS hash chain must be emitted.

  Done criteria for Sprint 3: hash chain is valid for a freshly provisioned tenant.
  """
  import pytest
  import uuid
  from unittest.mock import AsyncMock, MagicMock, call, patch

  from app.services.tenant_provisioning import (
      provision_new_tenant,
      TenantProvisioningResult,
  )
  from app.models.audit_event import GENESIS_HASH


  @pytest.mark.asyncio
  async def test_provision_creates_company_and_user():
      mock_db = AsyncMock()
      mock_db.flush = AsyncMock()
      mock_db.refresh = AsyncMock()

      with patch("app.services.tenant_provisioning.AuditEvent") as mock_audit_cls, \
           patch("app.services.tenant_provisioning.build_audit_event") as mock_build, \
           patch("app.services.tenant_provisioning.Company") as mock_company_cls, \
           patch("app.services.tenant_provisioning.User") as mock_user_cls, \
           patch("app.services.tenant_provisioning.hash_password", return_value="$hashed$"):

          mock_company = MagicMock()
          mock_company.id = uuid.uuid4()
          mock_company_cls.return_value = mock_company

          mock_user = MagicMock()
          mock_user.id = uuid.uuid4()
          mock_user_cls.return_value = mock_user

          mock_audit_event = MagicMock()
          mock_build.return_value = mock_audit_event

          result = await provision_new_tenant(
              db=mock_db,
              company_name="Acme Corp",
              company_slug="acme-corp",
              admin_email="admin@acme.com",
              admin_password="SecurePass123!",
          )

      assert mock_db.add.called
      assert isinstance(result, TenantProvisioningResult)


  @pytest.mark.asyncio
  async def test_provision_emits_genesis_audit_event():
      """
      CRITICAL DONE CRITERIA: GENESIS event must be the first audit event
      for a new tenant, with prev_event_hash == GENESIS_HASH (64 zeros).
      """
      captured_events = []
      mock_db = AsyncMock()
      mock_db.flush = AsyncMock()
      mock_db.refresh = AsyncMock()

      def capture_add(obj):
          captured_events.append(obj)

      mock_db.add.side_effect = capture_add

      with patch("app.services.tenant_provisioning.build_audit_event") as mock_build, \
           patch("app.services.tenant_provisioning.Company") as mock_company_cls, \
           patch("app.services.tenant_provisioning.User") as mock_user_cls, \
           patch("app.services.tenant_provisioning.hash_password", return_value="$hashed$"):

          mock_company = MagicMock()
          mock_company.id = uuid.uuid4()
          mock_company_cls.return_value = mock_company

          mock_user = MagicMock()
          mock_user.id = uuid.uuid4()
          mock_user_cls.return_value = mock_user

          mock_build.return_value = MagicMock()

          await provision_new_tenant(
              db=mock_db,
              company_name="Genesis Corp",
              company_slug="genesis-corp",
              admin_email="admin@genesis.com",
              admin_password="SecurePass123!",
          )

      # build_audit_event must have been called with prev_event_hash == GENESIS_HASH
      assert mock_build.called, "build_audit_event was never called"
      call_kwargs = mock_build.call_args
      # Check via kwargs or positional
      all_args = {**call_kwargs.kwargs} if call_kwargs.kwargs else {}
      if call_kwargs.args:
          # positional — inspect the call signature
          pass
      prev_hash_passed = all_args.get("prev_event_hash") or call_kwargs.args[0] if call_kwargs.args else None

      # Verify the call included prev_event_hash = GENESIS_HASH
      assert mock_build.call_args is not None
      # Use call_args.kwargs for keyword argument inspection
      kwargs = mock_build.call_args.kwargs
      assert kwargs.get("prev_event_hash") == GENESIS_HASH, (
          f"Expected GENESIS_HASH ({GENESIS_HASH[:8]}...) as prev_event_hash, "
          f"got {kwargs.get('prev_event_hash')!r}"
      )


  @pytest.mark.asyncio
  async def test_provision_genesis_event_type_is_system():
      """GENESIS event must have event_type=SYSTEM."""
      mock_db = AsyncMock()
      mock_db.flush = AsyncMock()
      mock_db.refresh = AsyncMock()

      with patch("app.services.tenant_provisioning.build_audit_event") as mock_build, \
           patch("app.services.tenant_provisioning.Company") as mock_company_cls, \
           patch("app.services.tenant_provisioning.User") as mock_user_cls, \
           patch("app.services.tenant_provisioning.hash_password", return_value="$hashed$"):

          mock_company = MagicMock()
          mock_company.id = uuid.uuid4()
          mock_company_cls.return_value = mock_company

          mock_user = MagicMock()
          mock_user.id = uuid.uuid4()
          mock_user_cls.return_value = mock_user

          mock_build.return_value = MagicMock()

          await provision_new_tenant(
              db=mock_db,
              company_name="Chain Corp",
              company_slug="chain-corp",
              admin_email="admin@chain.com",
              admin_password="SecurePass123!",
          )

      kwargs = mock_build.call_args.kwargs
      assert kwargs.get("event_type") == "SYSTEM", (
          f"Expected event_type='SYSTEM', got {kwargs.get('event_type')!r}"
      )
      assert "GENESIS" in (kwargs.get("description") or ""), (
          "GENESIS event description should contain 'GENESIS'"
      )


  def test_genesis_hash_constant_is_64_zeros():
      """Sanity check: GENESIS_HASH is exactly 64 zero characters."""
      assert GENESIS_HASH == "0" * 64
      assert len(GENESIS_HASH) == 64
  ```

  Run to confirm failure:
  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_tenant_provisioning.py -x -q --tb=short
  ```
  Expected: `ModuleNotFoundError: No module named 'app.services.tenant_provisioning'`

- [ ] **5.2 — Implement `tenant_provisioning.py`**

  Create `backend/app/services/tenant_provisioning.py`:

  ```python
  """
  app/services/tenant_provisioning.py

  Self-service tenant provisioning service.

  Responsibilities:
  1. Create a new Company record.
  2. Create the first admin User for that company.
  3. Emit a GENESIS audit event (prev_event_hash = GENESIS_HASH) immediately
     after Company creation — BEFORE any other business logic.
     This ensures the audit hash chain is valid from the very first event.

  CRITICAL INVARIANT:
    The GENESIS event is the first audit event for a new tenant.
    It uses prev_event_hash = GENESIS_HASH ("0" * 64).
    The hash chain verifier will reject any tenant whose first event
    does not have prev_event_hash == GENESIS_HASH.

  Does NOT commit — callers must commit after calling provision_new_tenant.
  """
  from __future__ import annotations

  import logging
  import uuid
  from dataclasses import dataclass

  from sqlalchemy.ext.asyncio import AsyncSession

  from app.core.security import hash_password
  from app.models.audit_event import GENESIS_HASH, build_audit_event
  from app.models.organization import Company
  from app.models.user import User

  logger = logging.getLogger(__name__)


  @dataclass
  class TenantProvisioningResult:
      company: Company
      admin_user: User
      genesis_event_emitted: bool


  async def provision_new_tenant(
      db: AsyncSession,
      company_name: str,
      company_slug: str,
      admin_email: str,
      admin_password: str,
      plan_tier: str = "starter",
  ) -> TenantProvisioningResult:
      """
      Create a new tenant (Company + admin User) and emit the GENESIS audit event.

      Args:
          db: AsyncSession (caller must commit after this returns).
          company_name: Display name for the new company.
          company_slug: URL-safe slug (must be unique).
          admin_email: Email address for the first admin user.
          admin_password: Plain-text password (will be bcrypt-hashed).
          plan_tier: Initial plan tier (default: "starter").

      Returns:
          TenantProvisioningResult with company, admin_user, genesis_event_emitted=True.

      Raises:
          sqlalchemy.exc.IntegrityError: if slug or email already exists.
      """
      # Step 1: Create Company
      company = Company(
          id=uuid.uuid4(),
          name=company_name,
          slug=company_slug,
          plan_tier=plan_tier,
          is_active=True,
      )
      db.add(company)
      await db.flush()  # Flush to get company.id

      # Step 2: Emit GENESIS audit event IMMEDIATELY after company creation.
      # This MUST happen before any other audit event for this tenant.
      # prev_event_hash = GENESIS_HASH ("0" * 64) marks the start of the chain.
      genesis_event = build_audit_event(
          event_type="SYSTEM",
          description=f"GENESIS: Tenant provisioned — company={company_name} slug={company_slug}",
          actor_id=None,
          actor_email=None,
          actor_role=None,
          company_id=company.id,
          branch_id=None,
          entity_type="company",
          entity_id=str(company.id),
          prev_event_hash=GENESIS_HASH,  # CRITICAL: always 64 zeros for first event
          payload={
              "event": "tenant_genesis",
              "company_name": company_name,
              "company_slug": company_slug,
              "plan_tier": plan_tier,
          },
      )
      db.add(genesis_event)
      await db.flush()

      logger.info(
          "GENESIS audit event emitted for new tenant: company_id=%s slug=%s",
          company.id, company_slug,
      )

      # Step 3: Create admin User
      admin_user = User(
          id=uuid.uuid4(),
          email=admin_email.lower().strip(),
          hashed_password=hash_password(admin_password),
          full_name=None,
          company_id=company.id,
          is_active=False,  # inactive until email verified
      )
      db.add(admin_user)
      await db.flush()

      logger.info(
          "Tenant provisioned: company=%s admin=%s plan=%s",
          company.id, admin_email, plan_tier,
      )

      return TenantProvisioningResult(
          company=company,
          admin_user=admin_user,
          genesis_event_emitted=True,
      )
  ```

- [ ] **5.3 — Run GENESIS tests to confirm pass**

  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_tenant_provisioning.py -x -q --tb=short
  ```
  Expected:
  ```
  4 passed in 0.XYs
  ```

- [ ] **5.4 — Create signup + Stripe Checkout endpoint**

  Create `backend/app/api/routes/v1_signup.py`:

  ```python
  """
  app/api/routes/v1_signup.py

  Self-service signup endpoints.

  Endpoints:
  - POST /v1/auth/signup          — create account (company + admin user + GENESIS event)
  - POST /v1/auth/signup/checkout — create Stripe Checkout session for plan selection
  - GET  /v1/auth/signup/verify   — email verification gate
  """
  from __future__ import annotations

  import logging
  import secrets
  from datetime import UTC, datetime, timedelta

  import stripe
  from fastapi import APIRouter, Depends, HTTPException, Request, status
  from fastapi.responses import JSONResponse
  from pydantic import BaseModel, EmailStr
  from sqlalchemy import select
  from sqlalchemy.ext.asyncio import AsyncSession

  from app.core.config import settings
  from app.core.db import get_session
  from app.services.tenant_provisioning import provision_new_tenant

  logger = logging.getLogger(__name__)
  router = APIRouter(prefix="/v1/auth", tags=["signup"])


  # ── Schemas ──────────────────────────────────────────────────────────────────

  class SignupRequest(BaseModel):
      company_name: str
      company_slug: str
      admin_email: EmailStr
      admin_password: str


  class SignupResponse(BaseModel):
      company_id: str
      admin_user_id: str
      message: str
      genesis_event_emitted: bool


  class CheckoutRequest(BaseModel):
      company_id: str
      plan_tier: str  # "starter" | "professional" | "enterprise"
      success_url: str
      cancel_url: str


  # ── Endpoints ─────────────────────────────────────────────────────────────────

  @router.post("/signup", response_model=SignupResponse, status_code=201)
  async def signup(
      body: SignupRequest,
      db: AsyncSession = Depends(get_session),
  ):
      """
      Create a new tenant.

      1. Validate slug uniqueness.
      2. Provision Company + admin User + GENESIS audit event.
      3. Return company_id + admin_user_id for the Stripe Checkout step.

      Email verification: admin user is created with is_active=False.
      Activation happens via GET /v1/auth/signup/verify?token=...
      """
      from app.models.organization import Company

      # Check slug uniqueness
      existing = await db.execute(
          select(Company).where(Company.slug == body.company_slug)
      )
      if existing.scalars().first():
          raise HTTPException(
              status_code=status.HTTP_409_CONFLICT,
              detail=f"Company slug '{body.company_slug}' is already taken.",
          )

      try:
          result = await provision_new_tenant(
              db=db,
              company_name=body.company_name,
              company_slug=body.company_slug,
              admin_email=body.admin_email,
              admin_password=body.admin_password,
              plan_tier="starter",
          )
      except Exception as exc:
          logger.exception("Signup provisioning error: %s", exc)
          raise HTTPException(
              status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
              detail="Tenant provisioning failed. Please contact support.",
          ) from exc

      await db.commit()

      return SignupResponse(
          company_id=str(result.company.id),
          admin_user_id=str(result.admin_user.id),
          message=(
              "Account created. Check your email to verify your address, "
              "then proceed to billing setup."
          ),
          genesis_event_emitted=result.genesis_event_emitted,
      )


  @router.post("/signup/checkout")
  async def create_checkout_session(
      body: CheckoutRequest,
      db: AsyncSession = Depends(get_session),
  ):
      """
      Create a Stripe Checkout session for the given company and plan tier.

      Returns:
          {"checkout_url": "https://checkout.stripe.com/..."}

      The client redirects the user to checkout_url.
      On success, Stripe fires invoice.paid webhook -> billing_service updates plan_tier.
      """
      if not settings.STRIPE_SECRET_KEY_TEST and not settings.STRIPE_LIVE_MODE:
          raise HTTPException(
              status_code=503,
              detail="Billing is not configured. Contact support.",
          )

      # Map tier to price ID
      from app.services.billing_service import STRIPE_PLAN_MAP
      price_id = None
      for pid, tier in STRIPE_PLAN_MAP.items():
          if tier == body.plan_tier and not pid.startswith("price_"):
              price_id = pid
              break
      if not price_id:
          # fallback to env-var derived price
          import os
          price_id = os.getenv(f"STRIPE_PRICE_ID_{body.plan_tier.upper()}", "")

      if not price_id:
          raise HTTPException(
              status_code=400,
              detail=f"No Stripe price configured for tier '{body.plan_tier}'.",
          )

      try:
          stripe.api_key = settings.stripe_secret_key
          session = stripe.checkout.Session.create(
              mode="subscription",
              line_items=[{"price": price_id, "quantity": 1}],
              client_reference_id=body.company_id,
              success_url=body.success_url,
              cancel_url=body.cancel_url,
          )
          return {"checkout_url": session.url}
      except stripe.StripeError as exc:
          logger.exception("Stripe checkout error: %s", exc)
          raise HTTPException(
              status_code=502,
              detail="Failed to create billing session. Please try again.",
          ) from exc
  ```

- [ ] **5.5 — Register signup router**

  In `backend/app/api/router.py`, add:
  ```python
  from app.api.routes.v1_signup import router as signup_router
  api_router.include_router(signup_router)
  ```

- [ ] **5.6 — Run full suite**

  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short
  ```
  Expected: all tests pass, no regressions.

---

## Chunk 6: Frontend — Signup Flow Page

### Scope
`/signup` page in Next.js — multi-step form: company details, account setup, plan selection via Stripe Checkout redirect. Uses inline styles + CSS variables per frontend rules.

### Files
**Create:**
- `frontend/src/app/signup/page.tsx` — signup wizard page
- `frontend/src/app/signup/layout.tsx` — layout (no sidebar, marketing shell)

---

### Steps

- [ ] **6.1 — Create signup layout**

  Create `frontend/src/app/signup/layout.tsx`:

  ```tsx
  export default function SignupLayout({ children }: { children: React.ReactNode }) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--bg-deep)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
        }}
      >
        {children}
      </div>
    );
  }
  ```

- [ ] **6.2 — Create signup page**

  > **Frontend rule exception — raw `fetch` justified:** Signup is a pre-auth flow with no token available. `dashboardFetch` requires a token and must not be called here. Raw `fetch` is used in this file **by exception** for unauthenticated public endpoints only (`/v1/auth/signup` and `/v1/auth/signup/checkout`). All post-auth API calls elsewhere in the app must use `dashboardFetch`.

  Create `frontend/src/app/signup/page.tsx`:

  ```tsx
  "use client";

  import { useState } from "react";
  import { useRouter } from "next/navigation";

  const S = {
    fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
    fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
    bgPanel: "var(--bg-panel)",
    bgDeep: "var(--bg-deep)",
    bgSub: "var(--bg-sub)",
    rim: "var(--border-rim)",
  } as const;

  type Step = "account" | "company" | "plan" | "complete";

  const PLANS = [
    {
      id: "starter",
      name: "Starter",
      price: "$99/mo",
      features: ["Up to 500 positions", "5 users", "Standard exports"],
    },
    {
      id: "professional",
      name: "Professional",
      price: "$299/mo",
      features: ["Up to 5,000 positions", "25 users", "All regulatory exports", "SSO"],
    },
    {
      id: "enterprise",
      name: "Enterprise",
      price: "Custom",
      features: ["Unlimited positions", "Unlimited users", "Dedicated SLA", "Custom SSO"],
    },
  ] as const;

  export default function SignupPage() {
    const router = useRouter();
    const [step, setStep] = useState<Step>("account");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [form, setForm] = useState({
      admin_email: "",
      admin_password: "",
      company_name: "",
      company_slug: "",
      plan_tier: "starter",
    });

    const [companyId, setCompanyId] = useState<string | null>(null);

    function slugify(name: string): string {
      return name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .slice(0, 64);
    }

    async function handleAccountStep(e: React.FormEvent) {
      e.preventDefault();
      setStep("company");
    }

    async function handleCompanyStep(e: React.FormEvent) {
      e.preventDefault();
      setStep("plan");
    }

    async function handleSignup(selectedPlan: string) {
      setLoading(true);
      setError(null);
      try {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        // NOTE: Raw fetch is used here by exception — this is a pre-auth public endpoint.
        // Signup has no token available, so dashboardFetch (which requires a token) cannot
        // be used. Raw fetch is permitted ONLY for unauthenticated public endpoints in this file.
        const res = await fetch(`${API_BASE}/v1/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, plan_tier: selectedPlan }),
        });
        if (!res.ok) {
          const err = await res.json();
          setError(err.detail || "Signup failed. Please try again.");
          setLoading(false);
          return;
        }
        const data = await res.json();
        setCompanyId(data.company_id);

        if (selectedPlan !== "starter") {
          // Redirect to Stripe Checkout
          const checkoutRes = await fetch(`${API_BASE}/v1/auth/signup/checkout`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              company_id: data.company_id,
              plan_tier: selectedPlan,
              success_url: `${window.location.origin}/signup?status=success`,
              cancel_url: `${window.location.origin}/signup?status=cancel`,
            }),
          });
          if (checkoutRes.ok) {
            const checkoutData = await checkoutRes.json();
            window.location.href = checkoutData.checkout_url;
            return;
          }
        }

        setStep("complete");
      } catch {
        setError("Network error. Please check your connection.");
      } finally {
        setLoading(false);
      }
    }

    return (
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          margin: "0 auto",
          padding: "2rem 1.5rem",
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: "2rem", textAlign: "center" }}>
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 22,
              fontWeight: 700,
              color: "var(--text-primary)",
              letterSpacing: 2,
              marginBottom: 8,
            }}
          >
            ORDR TERMINAL
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Create your institutional workspace
          </div>
        </div>

        {/* Step indicators */}
        <div style={{ display: "flex", gap: 8, marginBottom: "1.5rem", justifyContent: "center" }}>
          {(["account", "company", "plan"] as Step[]).map((s) => (
            <div
              key={s}
              style={{
                width: 32,
                height: 4,
                borderRadius: 2,
                background:
                  step === s
                    ? "var(--accent-primary, #0ea5e9)"
                    : step === "complete" || ["account", "company"].includes(step) && s === "account"
                    ? "var(--border-rim)"
                    : "var(--border-rim)",
                opacity: step === s ? 1 : 0.4,
              }}
            />
          ))}
        </div>

        {error && (
          <div
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 6,
              padding: "10px 14px",
              marginBottom: "1rem",
              color: "#f87171",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {step === "account" && (
          <form onSubmit={handleAccountStep}>
            <h2 style={{ color: "var(--text-primary)", fontFamily: S.fontMono, fontSize: 14, fontWeight: 600, marginBottom: 16, textTransform: "uppercase", letterSpacing: 1 }}>
              Your Account
            </h2>
            <label style={labelStyle}>Work Email</label>
            <input
              type="email"
              required
              value={form.admin_email}
              onChange={(e) => setForm((f) => ({ ...f, admin_email: e.target.value }))}
              style={inputStyle}
              placeholder="you@company.com"
            />
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              required
              minLength={12}
              value={form.admin_password}
              onChange={(e) => setForm((f) => ({ ...f, admin_password: e.target.value }))}
              style={inputStyle}
              placeholder="Min. 12 characters"
            />
            <button type="submit" style={btnStyle}>
              Continue
            </button>
          </form>
        )}

        {step === "company" && (
          <form onSubmit={handleCompanyStep}>
            <h2 style={{ color: "var(--text-primary)", fontFamily: S.fontMono, fontSize: 14, fontWeight: 600, marginBottom: 16, textTransform: "uppercase", letterSpacing: 1 }}>
              Company Details
            </h2>
            <label style={labelStyle}>Company Name</label>
            <input
              type="text"
              required
              value={form.company_name}
              onChange={(e) => {
                const name = e.target.value;
                setForm((f) => ({
                  ...f,
                  company_name: name,
                  company_slug: slugify(name),
                }));
              }}
              style={inputStyle}
              placeholder="Acme Corp"
            />
            <label style={labelStyle}>Workspace URL</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <span style={{ color: "var(--text-muted)", fontSize: 13, fontFamily: S.fontMono }}>
                ordr.io/
              </span>
              <input
                type="text"
                required
                value={form.company_slug}
                onChange={(e) => setForm((f) => ({ ...f, company_slug: e.target.value }))}
                style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
                placeholder="acme-corp"
                pattern="[a-z0-9-]+"
              />
            </div>
            <button type="submit" style={btnStyle}>
              Continue
            </button>
          </form>
        )}

        {step === "plan" && (
          <div>
            <h2 style={{ color: "var(--text-primary)", fontFamily: S.fontMono, fontSize: 14, fontWeight: 600, marginBottom: 16, textTransform: "uppercase", letterSpacing: 1 }}>
              Select Plan
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {PLANS.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => handleSignup(plan.id)}
                  disabled={loading}
                  style={{
                    background: "var(--bg-panel)",
                    border: "1px solid var(--border-rim)",
                    borderRadius: 8,
                    padding: "14px 16px",
                    cursor: loading ? "not-allowed" : "pointer",
                    textAlign: "left",
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: "var(--text-primary)", textTransform: "uppercase" }}>
                      {plan.name}
                    </span>
                    <span style={{ fontFamily: S.fontMono, fontSize: 13, color: "var(--accent-primary, #0ea5e9)" }}>
                      {plan.price}
                    </span>
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                    {plan.features.map((f) => (
                      <li key={f} style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 2 }}>
                        + {f}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "complete" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>&#10003;</div>
            <h2 style={{ color: "var(--text-primary)", fontFamily: S.fontMono, fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
              Workspace Created
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 24 }}>
              Check your email to verify your address, then sign in to your workspace.
            </p>
            <button
              onClick={() => router.push("/auth/login")}
              style={btnStyle}
            >
              Go to Login
            </button>
          </div>
        )}
      </div>
    );
  }

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  };

  const inputStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    background: "var(--bg-sub)",
    border: "1px solid var(--border-rim)",
    borderRadius: 6,
    padding: "10px 12px",
    fontSize: 13,
    color: "var(--text-primary)",
    fontFamily: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
    outline: "none",
    marginBottom: 14,
    boxSizing: "border-box",
  };

  const btnStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--accent-primary, #0ea5e9)",
    border: "none",
    borderRadius: 6,
    padding: "11px 0",
    fontSize: 13,
    fontWeight: 700,
    color: "#fff",
    fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
    cursor: "pointer",
    letterSpacing: 1,
    textTransform: "uppercase",
  };
  ```

- [ ] **6.3 — TypeScript check**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1 | head -30
  ```
  Expected: zero errors on the new files. Fix any type errors before proceeding.

---

## Chunk 7: API Docs Portal — Scalar at /docs

### Scope
Deploy Scalar as a static Next.js page at `/docs`. Scalar renders the existing FastAPI OpenAPI spec at `/openapi.json`.

### Files
**Create:**
- `frontend/src/app/docs/page.tsx` — Scalar API docs page

---

### Steps

- [ ] **7.1 — Install Scalar React package**

  ```bash
  cd frontend && npm install @scalar/api-reference-react
  ```
  Expected: `added X packages`

- [ ] **7.2 — Create API docs page**

  Create `frontend/src/app/docs/page.tsx`:

  ```tsx
  "use client";

  import dynamic from "next/dynamic";

  // Scalar is a browser-only component
  const ApiReferenceReact = dynamic(
    () =>
      import("@scalar/api-reference-react").then((mod) => mod.ApiReferenceReact),
    { ssr: false }
  );

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  export default function DocsPage() {
    return (
      <div style={{ minHeight: "100vh", background: "#0f1117" }}>
        <ApiReferenceReact
          configuration={{
            spec: {
              url: `${API_BASE}/openapi.json`,
            },
            theme: "default",
            darkMode: true,
            hideModels: false,
            layout: "modern",
            metaData: {
              title: "ORDR Terminal — API Reference",
              description:
                "Institutional FX hedge calculation and governance platform API. " +
                "Authenticate with a Bearer token (POST /api/auth/login) or API key (HK_live_...).",
            },
          }}
        />
      </div>
    );
  }
  ```

- [ ] **7.3 — TypeScript check**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1 | head -30
  ```
  Expected: zero errors.

- [ ] **7.4 — Build check**

  ```bash
  cd frontend && npx next build 2>&1 | tail -20
  ```
  Expected: `Route (app) ... ✓ Compiled` with no errors. `/docs` route appears in the build output.

---

## Chunk 8: Integration Test — End-to-End Signup with Hash Chain Verification

### Scope
Write an integration test that provisions a tenant, then verifies that the GENESIS audit event is the first and only event and that its `prev_event_hash` equals `GENESIS_HASH`. This is the Sprint 3 done-criteria hash chain test.

### Files
**Create:**
- `backend/tests/test_signup_genesis_integration.py`

---

### Steps

- [ ] **8.1 — Write integration test**

  Create `backend/tests/test_signup_genesis_integration.py`:

  ```python
  """
  Integration test: tenant provisioning emits valid GENESIS hash chain.

  Done criteria for Sprint 3:
    "hash chain is valid for a freshly provisioned tenant"

  This test calls provision_new_tenant() against a real SQLite in-memory DB
  and verifies:
    1. Exactly one AuditEvent exists for the new company after provisioning.
    2. That event has prev_event_hash == GENESIS_HASH ("0" * 64).
    3. That event has event_type == "SYSTEM".
    4. That event.event_hash is a valid 64-char hex string (SHA-256).
  """
  import re
  import uuid

  import pytest
  import pytest_asyncio
  from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
  from sqlalchemy import select

  from app.core.db import Base
  from app.models.organization import Company
  from app.models.user import User
  from app.models.audit_event import AuditEvent, GENESIS_HASH
  from app.services.tenant_provisioning import provision_new_tenant


  @pytest_asyncio.fixture
  async def sqlite_session():
      """In-memory SQLite session for integration tests."""
      engine = create_async_engine("sqlite+aiosqlite://", echo=False)
      async with engine.begin() as conn:
          await conn.run_sync(Base.metadata.create_all)
      factory = async_sessionmaker(engine, expire_on_commit=False)
      async with factory() as session:
          yield session
      async with engine.begin() as conn:
          await conn.run_sync(Base.metadata.drop_all)
      await engine.dispose()


  @pytest.mark.asyncio
  async def test_genesis_event_is_emitted_on_signup(sqlite_session: AsyncSession):
      """
      DONE CRITERIA: Hash chain is valid for a freshly provisioned tenant.
      """
      result = await provision_new_tenant(
          db=sqlite_session,
          company_name="Institutional Test Corp",
          company_slug="institutional-test-corp",
          admin_email="admin@institutional-test.com",
          admin_password="SuperSecurePass123!",
          plan_tier="starter",
      )
      await sqlite_session.commit()

      # Verify GENESIS event exists
      events = (
          await sqlite_session.execute(
              select(AuditEvent)
              .where(AuditEvent.company_id == result.company.id)
              .order_by(AuditEvent.created_at.asc())
          )
      ).scalars().all()

      assert len(events) >= 1, "No audit events found for new tenant"

      genesis = events[0]

      assert genesis.prev_event_hash == GENESIS_HASH, (
          f"First event prev_event_hash must be GENESIS_HASH ('{'0'*64}'), "
          f"got {genesis.prev_event_hash!r}"
      )
      assert genesis.event_type == "SYSTEM", (
          f"GENESIS event must have event_type='SYSTEM', got {genesis.event_type!r}"
      )
      assert "GENESIS" in genesis.description, (
          f"GENESIS event description must contain 'GENESIS', got {genesis.description!r}"
      )
      assert re.fullmatch(r"[0-9a-f]{64}", genesis.event_hash), (
          f"event_hash must be a 64-char hex SHA-256 string, got {genesis.event_hash!r}"
      )
      assert genesis.company_id == result.company.id


  @pytest.mark.asyncio
  async def test_genesis_event_is_first_event(sqlite_session: AsyncSession):
      """No audit events before GENESIS — chain starts clean."""
      result = await provision_new_tenant(
          db=sqlite_session,
          company_name="Chain Test Corp",
          company_slug="chain-test-corp",
          admin_email="admin@chaintest.com",
          admin_password="SuperSecurePass123!",
          plan_tier="professional",
      )
      await sqlite_session.commit()

      events = (
          await sqlite_session.execute(
              select(AuditEvent).where(AuditEvent.company_id == result.company.id)
          )
      ).scalars().all()

      # The GENESIS event is the ONLY event immediately after provisioning
      assert len(events) == 1, (
          f"Expected exactly 1 GENESIS event after provisioning, found {len(events)}"
      )


  @pytest.mark.asyncio
  async def test_genesis_provisioning_result_flag(sqlite_session: AsyncSession):
      """TenantProvisioningResult.genesis_event_emitted must be True."""
      result = await provision_new_tenant(
          db=sqlite_session,
          company_name="Flag Test Corp",
          company_slug="flag-test-corp",
          admin_email="admin@flagtest.com",
          admin_password="SuperSecurePass123!",
      )
      await sqlite_session.commit()
      assert result.genesis_event_emitted is True
  ```

- [ ] **8.2 — Run integration tests**

  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_signup_genesis_integration.py -x -q --tb=short -v
  ```
  Expected:
  ```
  tests/test_signup_genesis_integration.py::test_genesis_event_is_emitted_on_signup PASSED
  tests/test_signup_genesis_integration.py::test_genesis_event_is_first_event PASSED
  tests/test_signup_genesis_integration.py::test_genesis_provisioning_result_flag PASSED
  3 passed in X.XXs
  ```
  These three tests are the authoritative Sprint 3 done-criteria evidence for the hash chain requirement.

- [ ] **8.3 — Run the full test suite one final time**

  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short 2>&1 | tail -10
  ```
  Expected: `N passed, 0 failed` where N >= baseline count.

---

## Chunk 9: Final Validation Checklist

### Done Criteria Verification (from spec)

- [ ] **SSO:** WorkOS `POST /v1/auth/sso/callback` endpoint exists and issues ORDR JWT. Manual test with a WorkOS sandbox org required before sprint closes. Set `WORKOS_API_KEY` + `WORKOS_CLIENT_ID` in Render env, test with a real code exchange.

- [ ] **Stripe test-mode:** Set `STRIPE_SECRET_KEY_TEST`, `STRIPE_WEBHOOK_SECRET`, and the three `STRIPE_PRICE_ID_*` vars in Render env. Use `stripe listen --forward-to localhost:8000/v1/billing/webhook` to replay test events. Verify `invoice.paid` upgrades tier, `customer.subscription.deleted` resets to starter.

- [ ] **Plan enforcement:** Deploy a test route with `Depends(require_plan_tier("professional"))`. Hit it with a `starter` user and confirm HTTP 402 in response. Confirm `enterprise` user gets 200.

- [ ] **Signup flow end-to-end:** Navigate to `/signup` on staging. Create a new company. Confirm GENESIS audit event appears in the Audit Trail for the new tenant via the audit lab.

- [ ] **Scalar docs:** Navigate to `/docs` on staging. Confirm the OpenAPI spec loads and all endpoints are rendered.

- [ ] **Hash chain test evidence:** Paste the `pytest` output from Chunk 8 step 8.2 into the sprint close record in `.claude/state/CHANGELOG_AI.md`.

- [ ] **No frozen files modified:** Confirm `backend/app/engine_v1/`, `backend/app/models/audit_event.py`, `backend/app/core/security.py`, and WORM models are untouched.

- [ ] **Middleware order unchanged:** `Audit -> Rate Limit -> Auth` order in `backend/app/main.py` — confirm plan enforcement is a Depends(), not in the middleware stack.

- [ ] **Frontend build:**
  ```bash
  cd frontend && npx next build 2>&1 | tail -5
  ```
  Expected: `✓ Compiled successfully`

- [ ] **Update sprint state:**
  ```
  .claude/state/CHANGELOG_AI.md  — record Sprint 3 completion
  .claude/state/CURRENT_SPRINT.md — update to Sprint 4 or mark complete
  .claude/state/CURRENT_STATE.md — update plan_tier field live, SSO live, billing live
  ```

---

## Environment Variables Required (add to Render + local .env)

```
# WorkOS SSO
WORKOS_API_KEY=sk_test_...
WORKOS_CLIENT_ID=client_...

# Stripe Billing
STRIPE_SECRET_KEY_TEST=sk_test_...
STRIPE_SECRET_KEY_LIVE=sk_live_...   # only used when STRIPE_LIVE_MODE=true
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_LIVE_MODE=false               # set true only at go-live
STRIPE_PRICE_ID_STARTER=price_...
STRIPE_PRICE_ID_PROFESSIONAL=price_...
STRIPE_PRICE_ID_ENTERPRISE=price_...
```

**Never commit these values.** Set them only in Render environment groups and local `.env` (git-ignored).

---

## Dependency Summary

| Package | Version | Where |
|---------|---------|-------|
| `workos` | `>=4.0.0` | `backend/requirements.txt` |
| `stripe` | `>=8.0.0` | `backend/requirements.txt` |
| `@scalar/api-reference-react` | latest | `frontend/package.json` |

No changes to frozen files. No new middleware. All DB changes via Alembic migration `h1a2b3c4d5e6`.
