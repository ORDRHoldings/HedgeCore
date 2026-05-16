# ADR-0020: Enterprise Audit Controls Hardening

- **Status:** accepted
- **Date:** 2026-05-13 (retroactive — commit `fbc1eb1`)
- **Deciders:** Backend / Security
- **Refines:** ADR-0006 (pentest prep), ADR-0007 (IP allowlist middleware)
- **Related:** ADR-0008 (engine_v1 type-only changes), `docs/audits/2026-05-12-enterprise-software-audit.md`

## Context

The 2026-05-12 enterprise audit (`docs/audits/2026-05-12-enterprise-software-audit.md`)
identified three control gaps that block enterprise procurement and pentest sign-off:

1. **API-key secret hashing was bcrypt-only.** bcrypt is a passable password hash but
   is not the right primitive for non-interactive credentials: it has no built-in
   pepper, is not memory-hard, and offers no offline-attack hardening if the DB is
   exfiltrated.
2. **PostgreSQL RLS was advertised but not unconditionally enforced.** A misconfigured
   session that forgot to `SET LOCAL app.current_tenant_id` would silently return
   cross-tenant rows — the application layer was the only barrier.
3. **Cross-cutting governance primitives** (kill switch, heartbeat, hash-chain
   verifier, identity verifier, policy enforcer) were scattered across `app/services/`,
   `app/middleware/`, and `app/engine_v1/`. There was no canonical "kernel" namespace
   for the small set of always-on safety primitives that a regulator audit would walk.

Two of the affected files are listed as **frozen** in `CLAUDE.md`:

- `backend/app/core/security.py` (frozen — JWT + API key auth)
- `backend/app/models/audit_event.py` (frozen — WORM model; not modified by this change)

Per `.claude/rules/architecture.md`, modifications to frozen files require an ADR.
This ADR is retroactive for commit `fbc1eb1` ("Harden enterprise audit controls",
2026-05-13, 81 files changed, +1,739 / −357).

## Decision

### 1. API-key verification: Argon2id + pepper

Replace bcrypt with Argon2id for API-key secret hashing, with a server-side **pepper**
loaded from `API_KEY_PEPPER` (32+ bytes, rejected as missing in production).

`app/core/security.verify_api_key()` becomes a compatibility wrapper around the
canonical implementation in `app/services/api_keys.verify_api_key_header()`. The
canonical path:

- parses `HK_live_{key_id}.{secret}`
- looks up the key by `key_id`
- enforces `status == active` and `expires_at > now (UTC)`
- verifies the secret with `argon2.PasswordHasher.verify(hash, pepper + secret)`
- supports automatic rehash-on-verify when Argon2 parameters are upgraded

bcrypt remains the hash for **interactive user passwords** (`hash_password()` and
`verify_password()` in `core/security.py`) — that surface is unchanged. Only the
non-interactive API-key path moves to Argon2id.

Migration: existing bcrypt-hashed keys are rehashed on next successful verification.
Keys not seen within 90 days require explicit rotation.

### 2. Force RLS tenant context (migration 0036)

`backend/migrations/versions/0036_force_rls_tenant_context.py` adds a `FORCE ROW LEVEL
SECURITY` clause to every tenant-scoped table and ensures the connection-level
`app.current_tenant_id` GUC defaults to a sentinel (`'00000000-0000-0000-0000-000000000000'`)
that matches **zero rows** in any tenant table.

The application's session factory (`app/core/db.py` + `app/db/session.py`) now sets
`app.current_tenant_id` inside `BEGIN` for every request-scoped session. A request that
fails to set tenant context reads zero rows — fail-closed.

`app/core/rls.py` is extended (+97 lines) with:

- `ensure_tenant_context(session, tenant_id)` — sets the GUC and asserts it post-set
- `assert_rls_active(session)` — verifies `row_security = on` and FORCE flag on probe
- Test fixtures (`bypass_rls_for_tests`) that explicitly opt-in to RLS bypass under
  a superuser role, with the bypass logged

### 3. `synex_kernel/` namespace

A new top-level package `backend/synex_kernel/` collects the always-on governance
primitives that need to be discoverable in a regulator walkthrough as a single,
small surface area:

- `audit/chain.py` — SHA-256 per-tenant hash chain helpers (delegates to
  `engine_v1/hasher.py` — no duplication of the canonical kernel)
- `audit/models.py` — read-only views over WORM tables
- `audit/triggers.py` — manages the BEFORE UPDATE / BEFORE DELETE triggers on
  `audit_events`, `calculation_runs`, `policy_revisions`
- `constants.py` — `GENESIS_HASH = "0" * 64` re-exported as the canonical constant
- `db/session.py` — RLS-aware session factory
- `health/{budget,heartbeat,kill_switch,status}.py` — operational kill switch +
  liveness primitives
- `identity/verifier.py` — minimal identity verifier used by `governance.py` middleware
- `middleware/governance.py` — single middleware that orchestrates kill-switch +
  identity + RLS-context-set in the request pipeline
- `policy/{enforcer,loader}.py` — declarative policy loader (consumed by RBAC layer)

`synex_kernel/` is **dependency-only**: nothing in `app/engine_v1/` imports from it.
The engine kernel (`engine_v1/`) remains the deterministic-math frozen surface;
`synex_kernel/` is the governance-primitive surface. They are siblings, not nested.

### 4. Frozen file diff scope (`app/core/security.py`)

The net change to `security.py` is a **reduction** of 129 lines: the inline
`verify_api_key()` body is removed in favor of a thin wrapper calling the canonical
service. JWT issuance, password hashing (`hash_password`/`verify_password`), and
`get_current_user`/`require_superuser` dependencies are **unchanged**.

No new public API. No change to JWT claims, token TTL, or refresh semantics. No
change to `GENESIS_HASH`. No change to middleware order
(`Audit → RateLimit → Auth` preserved).

## Consequences

### Positive

- Argon2id+pepper eliminates the bcrypt-only API-key offline-attack surface flagged
  by the 2026-05-12 audit.
- FORCE RLS makes the "forgot to set tenant context" failure mode fail-closed rather
  than fail-open.
- `synex_kernel/` gives auditors and the pentest team a single discoverable surface
  for governance primitives — previously scattered across 4 layers.
- 472-line audit document (`docs/audits/2026-05-12-enterprise-software-audit.md`) is
  resolved end-to-end.
- `security.py` is **simpler** after the change (129 lines removed) — the canonical
  verifier moves to `app/services/api_keys.py` where it belongs.

### Negative

- New runtime dependency: `argon2-cffi`. Adds ~1MB to the image. Mitigation: pinned
  version in `requirements.txt`; CVE feed monitored.
- One-time rehash cost on first verification of legacy keys (~50ms per key).
  Mitigation: amortized; new keys hash at issuance.
- Operational change: production now **requires** `API_KEY_PEPPER` env var. Mitigation:
  config validator in `app/core/config.py` rejects boot if missing in `ENV=production`.
- `synex_kernel/` introduces a second top-level package. Mitigation: clear scope
  separation documented above; no import cycle with `app/` (verified).

### Neutral

- `core/security.py` is still frozen. Future edits — even net-reductions — require
  an ADR.
- WORM table invariants (append-only, hash chain) are **unchanged**.
- R1–R8 risk taxonomy, strategy→instrument mapping, middleware order: **unchanged**.

## References

- ADR-0006: Pentest prep — attack surface
- ADR-0007: IP allowlist middleware before audit
- `docs/audits/2026-05-12-enterprise-software-audit.md` — source audit
- `backend/app/services/api_keys.py` — canonical Argon2id verifier
- `backend/migrations/versions/0036_force_rls_tenant_context.py` — FORCE RLS migration
- `backend/synex_kernel/` — governance kernel namespace
- `backend/app/core/rls.py` — `ensure_tenant_context()`, `assert_rls_active()`
- Commit: `fbc1eb1` (2026-05-13)
