# ADR-0015: Live ERP / Accounting Connector Framework

**Status:** accepted
**Date:** 2026-04-23
**Deciders:** ORDR Edge

## Context

ORDR TreasuryFX v1 previously integrated with external accounting/ERP systems
only via audited CSV/Excel import (`v1/connectors/import/csv`, `/import/excel`)
and paper-mode stubs (`/accounting/import`, `/erp/sync`). For institutional
adoption (Fortune-500, BlackRock/Bloomberg tier), live bidirectional
integrations are table-stakes:

- Pull chart-of-accounts and trial-balance reports for auto-mapping
- Post hedge-accounting GL journals directly to the ERP
- Receive change events (webhooks where available, polling otherwise)
- Do all of this under per-tenant OAuth 2.0, with encrypted token storage,
  per-provider rate budgets, circuit breakers, and normalized error handling

The five providers with >95% coverage of the target market are:
QuickBooks Online, Xero, NetSuite, Sage Intacct, Microsoft Dynamics 365 Finance.

## Decision

Introduce a provider-agnostic connector framework under `backend/app/connectors/`:

```
connectors/
  base.py          — ConnectorProtocol, normalized dataclasses (TokenBundle,
                     JournalPayload, COAAccount, TrialBalanceEntry, …)
  errors.py        — ConnectorError hierarchy (Auth/Validation/RateLimit/
                     Server/CircuitOpen/Webhook/NotConfigured) each with
                     a canonical HTTP status code
  oauth_state.py   — CSRF state store (Redis + signed-JWT fallback)
  token_vault.py   — Fernet MultiFernet token encryption, stored in
                     company.settings JSONB
  rate_limiter.py  — Per-tenant+provider token bucket (Redis Lua via
                     register_script, in-memory fallback)
  retry.py         — Exponential backoff + per-tenant+provider circuit
                     breaker (threshold, cooldown, Sentry emission on trip)
  registry.py      — provider_id → connector class dispatch
  quickbooks/, xero/, netsuite/, sage_intacct/, dynamics365/
                   — one package per provider, each implementing
                     ConnectorProtocol
```

Routes (`/api/v1/connectors/*`) are **provider-agnostic**: all data operations
are dispatched via `registry.get_connector(provider_id)`. Adding a sixth
provider requires only (a) a new package implementing `ConnectorProtocol` and
(b) a single entry in `_PROVIDERS` in `registry.py`.

### Security boundaries

- **Token vault** uses Fernet (AES-128-CBC + HMAC-SHA256) via `MultiFernet`
  so keys rotate without downtime. Keys live in `CONNECTOR_ENCRYPTION_KEY`
  (comma-separated for rotation). This key is **independent** from
  `JWT_SECRET` — rotating OAuth tokens does not invalidate active user
  sessions.
- **OAuth state** uses a signed JWT (HS256) with a Redis-backed replay guard
  (`connector:oauth_state:{nonce}` SETEX 10 min). On Redis outage, only JWT
  signature + exp protect against replay — acceptable because the token is
  consumed within ~30 seconds of issuance.
- **Rate limiter** uses a server-side Lua script registered via
  `client.register_script` (never raw `eval`). The script is loaded via
  `SCRIPT LOAD` and invoked by sha1 (`EVALSHA`); no client-side code
  execution occurs.
- **Circuit breaker** is per-tenant+provider, so a QBO outage for tenant A
  cannot cascade into Xero for tenant B. Opens after
  `CONNECTOR_CIRCUIT_BREAKER_THRESHOLD=5` consecutive 5xx, closes after
  `CONNECTOR_CIRCUIT_BREAKER_COOLDOWN_SEC=600`s. Emits a Sentry alert on trip.
- **Webhooks** verify provider-specific HMAC signatures (QBO: SHA-256 base64
  of body with `intuit-signature`; Xero: `x-xero-signature`). NetSuite,
  Intacct, D365 Finance do not emit HTTPS webhooks — they require polling or
  Azure Event Grid.

### Fail-open vs fail-closed

- **Rate limiter** is fail-open: Redis errors fall through silently (matches
  the intentional fail-open semantics of the market-data Redis cache).
- **Circuit breaker** is fail-closed at the individual request level but
  fail-open at the store level: if breaker state cannot be read from Redis,
  the call proceeds (breaker defaults to closed).
- **Token vault** is fail-closed: a decryption failure raises
  `ConnectorAuthError` immediately.
- **OAuth state** is fail-closed on signature, fail-open on replay (when
  Redis is unreachable).

### Dry-run posting

`JournalPayload.dry_run=True` short-circuits `post_journal()` to return
validation results without side effects. QuickBooks simulates dry-run by
verifying every `account_external_id` resolves against the live CoA; other
providers reject unresolvable refs server-side.

## Consequences

### Positive
- Five production-grade ERP integrations replace paper-mode stubs.
- Adding a new provider = one package + one registry entry. No other code
  changes.
- All connector errors map to a single HTTP status via `exc.http_status` —
  routes no longer need per-provider error translation.
- Encryption key rotation is zero-downtime via `MultiFernet`.
- Per-tenant circuit breakers prevent provider outages from becoming
  platform-wide failures.

### Negative
- Operating surface expands: 5 providers × OAuth credentials × webhook
  endpoints must be configured per deployment. Config validator must refuse
  to boot in production if credentials are populated for a provider but
  `CONNECTOR_ENCRYPTION_KEY` is absent.
- Session management for Sage Intacct is stateful (session IDs expire after
  ~1 hour) — requires a refresh flow that reopens via stored credentials.
  User password is stored encrypted in the token vault; if compromised, the
  tenant must rotate the Intacct user_password.
- NetSuite + D365 Finance have no webhook story — change detection relies on
  scheduled polling (out of v1 scope).

### Neutral
- Rate budgets (QBO 500/min, Xero 60/min, NetSuite 600/min, Intacct 100/min,
  D365 600/min) are configured per-provider in `PROVIDER_BUDGETS`.
  Overriding via env is supported via the provider-specific class if tighter
  client-side limits are required.

## References

- ADR-0009 (Outbound GL Journal Entry Posting) — upstream source of
  `JournalPayload`; this ADR's connector framework delivers the ERP-posting
  leg of that decision.
- ADR-0007 (IP allowlist middleware before audit) — confirms middleware
  ordering is preserved; connector routes live downstream of Audit → Rate
  Limit → Auth.
- `docs/superpowers/specs/2026-04-23-launch-readiness-design.md` — full
  design spec including non-connector tracks (logger, error boundaries,
  type sweep, E2E, production readiness).
- `backend/app/connectors/*` — implementation.
