# Security Policy

ORDR TreasuryFX handles institutional FX hedge calculations, audit-trail data,
and tenant-scoped OAuth tokens for live ERP/Accounting integrations. We take
security issues seriously and appreciate responsible disclosure.

## Supported Versions

Security patches are issued for the current `master` branch and the most
recent release candidate. Older branches receive fixes only if the issue is
rated Critical or High.

| Version       | Supported |
| ------------- | --------- |
| `master`      | ✅         |
| `v1.0.0-rc*`  | ✅         |
| `< v1.0.0-rc` | ❌         |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security reports.**

Email: `security@synexiun.com`
PGP: available on request (reply will include key fingerprint)

Please include:

- Affected component (backend path, frontend route, connector, infra)
- Reproduction steps (minimal, ideally against a local checkout)
- Impact assessment (auth bypass, data exposure, tamper, DoS, etc.)
- Any logs, request/response samples, or PoC code
- Whether the issue is currently being exploited (to our knowledge)

We aim to:

- Acknowledge the report within **2 business days**
- Provide an initial triage verdict within **5 business days**
- Ship a fix or mitigation for Critical/High issues within **14 days**
- Credit the reporter in the release notes unless anonymity is requested

## Scope

### In scope

- Authentication / authorization (JWT, API keys, CSRF, RBAC, Separation of Duties)
- WORM table integrity (audit_events, calculation_runs, policy_revisions)
- Hash-chain tamper detection
- Rate limiting and abuse prevention
- OAuth token vault (Fernet encryption, key rotation, leakage)
- ERP / Accounting connector framework (QuickBooks, Xero, NetSuite, Sage
  Intacct, Dynamics 365 Finance) — signature verification, state replay,
  circuit breaker bypass
- Tenant isolation in multi-tenant data access
- Secret leakage in logs, error messages, OpenAPI schema, or git history
- Dependency vulnerabilities with a practical exploit against our code path

### Out of scope

- Rate limits bypassed via distributed IPs (we rely on a defense-in-depth
  stack, not this single layer)
- Social engineering of our staff or contractors
- Physical attacks or attacks requiring host compromise
- Reports from automated scanners without a demonstrated impact
- Best-practice recommendations without an accompanying exploit
- Denial of service via resource exhaustion in sandbox/preview environments
- Self-XSS or issues requiring a user to paste attacker-controlled payloads
  into the dev console

## Security Architecture (high-level)

Relevant rules live in `.claude/rules/security.md` and are enforced at
review time. Highlights:

- **Secrets**: `gitleaks` scans on every push; `JWT_SECRET` must be ≥ 32
  chars; production refuses dev defaults.
- **Auth**: JWT HS256 access + refresh, bcrypt passwords, CSRF
  double-submit cookie, API keys stored bcrypt-hashed with `HK_live_`
  prefix.
- **WORM**: `audit_events`, `calculation_runs`, `policy_revisions` are
  append-only; SHA-256 hash chain is per-tenant and genesis-anchored.
- **RBAC**: 9 roles × 41 permissions, fail-closed, hierarchy levels 0–15.
- **Separation of Duties**: the same user cannot make AND check an
  execution proposal.
- **Middleware order**: `Audit → Rate Limit → Auth` (never reordered).
- **Connector tokens**: Fernet `MultiFernet` with zero-downtime key
  rotation via `CONNECTOR_ENCRYPTION_KEY`, independent from `JWT_SECRET`.
- **Webhook verification**: provider-specific HMAC (Intuit, Xero); no
  unauthenticated provider-initiated writes otherwise.
- **OAuth state**: signed JWT + Redis-backed replay guard (10-min TTL);
  fail-closed on signature, fail-open on replay when Redis is
  unreachable.

## Hardening Expectations for Deployments

Operators running ORDR TreasuryFX in production should:

- Set `ENV=production`, a unique `JWT_SECRET`, and a populated
  `CONNECTOR_ENCRYPTION_KEY` (comma-separated for rotation).
- Configure `CORS_ALLOW_ORIGINS` to an explicit allow-list (never `*`).
- Enable `GITLEAKS_ENABLED=true` pre-commit hook in internal forks.
- Run `GET /system/health/deep` and `GET /v1/admin/monitor/hash-chain/verify`
  from a monitoring tenant at least daily.
- Rotate OAuth client secrets annually or on any incident.
- Review `docs/architecture/adr/` for security-relevant decisions before
  deploying a new provider or auth flow.

## Responsible Disclosure Principles

We follow Coordinated Vulnerability Disclosure. We will not pursue legal
action against researchers who:

- Make a good-faith effort to avoid privacy violations and data destruction
- Test only against systems they own or against `*.preview.vercel.app` /
  `staging.*` environments we've approved for testing
- Give us a reasonable disclosure window before going public
- Do not exfiltrate data beyond what is necessary to demonstrate the issue

## Contact

- Security mailbox: `security@synexiun.com`
- Coordinated disclosure lead: ORDR Edge (see `docs/architecture/adr/` for
  named deciders on recent ADRs)
