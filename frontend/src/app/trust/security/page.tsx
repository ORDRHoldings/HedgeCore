"use client";

import TrustDocLayout, {
  H2, H3, P, UL, Code, Callout, StatusTable, Pill,
} from "@/components/marketing/TrustDocLayout";

export default function SecurityOverviewPage() {
  return (
    <TrustDocLayout
      eyebrow="Security overview"
      title="Security overview"
      lastReviewed="2026-04-25"
    >
      <P>
        For customer security teams, procurement, IT, and internal auditors evaluating ORDR TreasuryFX.
        Companion documents: <a href="/trust/compliance" style={{ color: "#1E3A5F" }}>Compliance status</a>{" "}
        · <a href="/trust/soc2" style={{ color: "#1E3A5F" }}>SOC 2 readiness attestation</a>.
      </P>

      <H2>1. Application security</H2>

      <H3>Authentication</H3>
      <UL>
        <li><strong>JWT HS256</strong> access tokens, 30-minute lifetime</li>
        <li><strong>Refresh tokens</strong>, 7-day lifetime, rotated on use</li>
        <li><strong>bcrypt</strong> password hashing, cost factor 12</li>
        <li><strong>CSRF</strong> double-submit cookie + header (<Code>X-CSRF-Token</Code>) on all mutation routes; JWT Bearer-authenticated requests bypass CSRF check by design (token possession is the equivalent of CSRF protection)</li>
        <li><strong>Rate limiting</strong>: 60 req/min per user/IP, TokenBucket implementation in middleware</li>
        <li><strong>Session invalidation</strong>: forced on password change, role change, or admin-initiated revocation</li>
      </UL>

      <H3>Authorization</H3>
      <UL>
        <li><strong>RBAC</strong>: 9 roles (Owner, Admin, Treasurer, Trader, Risk Officer, Controller, Auditor, Viewer, API) × 41 permissions × hierarchy level 0–15</li>
        <li><strong>Fail-closed</strong>: missing permission = denied (no implicit grants)</li>
        <li><strong>Separation of Duties</strong>: same user cannot both make and check an execution proposal in the 4-eyes pipeline</li>
        <li><strong>Multi-tenant isolation</strong>: every query scoped to <Code>tenant_id</Code>; cross-tenant access is structurally impossible at the ORM layer</li>
        <li><strong>Superuser-only endpoints</strong> use a separate dependency (<Code>require_superuser</Code>)</li>
      </UL>

      <H3>Input validation</H3>
      <UL>
        <li><strong>Pydantic v2</strong> schemas validate every API input</li>
        <li><strong>Fail-closed validator</strong> at engine boundary (<Code>engine_v1/validator.py</Code>) rejects malformed inputs with audit-ledger entry</li>
        <li><strong>No raw SQL</strong> in route handlers — SQLAlchemy ORM only</li>
        <li><strong>Parameterized queries</strong> throughout</li>
        <li>No unsafe HTML-injection APIs in user-facing rendering paths</li>
        <li>Server-side rendering is the default in Next.js App Router; user-supplied content is escaped by React</li>
      </UL>

      <H3>Output handling</H3>
      <UL>
        <li><strong>Strict CSP</strong> with no inline scripts in production</li>
        <li><Code>X-Content-Type-Options: nosniff</Code></li>
        <li><Code>X-Frame-Options: DENY</Code></li>
        <li><Code>Referrer-Policy: strict-origin-when-cross-origin</Code></li>
        <li><strong>HSTS</strong> with preload directive</li>
        <li>CORS configured per environment, <strong>no wildcard in production</strong></li>
      </UL>

      <H2>2. Data security</H2>

      <H3>Encryption</H3>
      <UL>
        <li><strong>TLS 1.3</strong> in transit (TLS 1.2 minimum, with strong cipher suites)</li>
        <li><strong>AES-256</strong> at rest (managed Postgres + S3-compatible backup storage)</li>
        <li><strong>Bcrypt</strong> for passwords (cost 12); <strong>never</strong> plaintext or reversible</li>
        <li><strong>API keys</strong> stored as bcrypt hashes; plaintext value visible to user only at creation</li>
        <li><strong>JWT signing keys</strong> rotated quarterly; dual-key window for zero-downtime rotation</li>
      </UL>

      <H3>Data classification</H3>
      <StatusTable rows={[
        { label: "Customer Data — restricted", value: "Hedge proposals, exposures, ledger entries — stored in customer's region, encrypted, RBAC-gated" },
        { label: "Personal Data", value: "User name, email, login times — stored alongside Customer Data, GDPR-governed" },
        { label: "Authentication credentials", value: "Password hashes, MFA secrets — bcrypt; never logged; rotated on personnel change" },
        { label: "Operational logs", value: "Application logs, access logs — 90-day retention, PII-redacted, separate from audit ledger" },
        { label: "Audit ledger", value: "WORM events with hash chain — 7-year retention minimum, append-only, integrity-verifiable" },
      ]} />

      <H3>Multi-tenancy</H3>
      <P>ORDR TreasuryFX is <strong>logically tenant-isolated</strong> by default:</P>
      <UL>
        <li>Every persisted row carries <Code>tenant_id</Code></li>
        <li>Every query is scoped at the ORM layer</li>
        <li>Hash chains are per-tenant from individual GENESIS_HASH</li>
        <li>Cross-tenant joins are not expressed anywhere in the codebase</li>
      </UL>
      <P>
        <strong>Enterprise</strong> customers may opt for a <strong>dedicated tenant database</strong> (separate Postgres instance) for strict physical isolation. Available via Order Form add-on.
      </P>

      <H2>3. Audit and integrity</H2>

      <H3>WORM tables</H3>
      <P>
        <Code>audit_events</Code>, <Code>calculation_runs</Code>, <Code>policy_revisions</Code>, and <Code>ledger_entries</Code> are append-only. We enforce this at three layers:
      </P>
      <UL>
        <li><strong>Application</strong> — no UPDATE or DELETE statements emitted</li>
        <li><strong>Database</strong> — NO UPDATE / NO DELETE triggers on these tables</li>
        <li><strong>Operational</strong> — quarterly hash-chain verification job confirms no rewrites</li>
      </UL>
      <Callout tone="warn">
        If a row is ever discovered to have changed, it is treated as a Sev-1 incident regardless of cause.
      </Callout>

      <H3>Hash chain</H3>
      <UL>
        <li><strong>SHA-256</strong></li>
        <li><strong>Per-tenant</strong> (each tenant has its own chain head)</li>
        <li><strong>GENESIS_HASH = 0000…0000</strong> (64 zeros)</li>
        <li>Each row's hash = SHA-256(prev_hash || serialized_row)</li>
        <li>The current head is published in the daily integrity check</li>
        <li>Customers can verify the chain end-to-end using their exported audit pack</li>
      </UL>
      <P>
        This is the difference between &quot;we logged it&quot; and &quot;we can prove we didn&apos;t change it.&quot; The audit chain is what makes ORDR&apos;s claims provable to a Big 4 auditor without taking our word for it.
      </P>

      <H3>Calculation reproducibility</H3>
      <P>
        Every hedge calculation is logged with its <Code>RunEnvelope</Code> — input snapshot, parameter set, deterministic seed. Re-running the kernel with the envelope produces a bit-identical output. This is what enables:
      </P>
      <UL>
        <li>Reproducible audit answers months later</li>
        <li>Regression testing in CI</li>
        <li>Forensic reconstruction of any historical decision</li>
      </UL>
      <P>There is no ML, no random sampling, no time-dependent behavior. Determinism is the design.</P>

      <H2>4. Infrastructure security</H2>

      <H3>Hosting</H3>
      <UL>
        <li><strong>Backend (FastAPI)</strong>: Render.com — managed container hosting, auto-deploy on master push, EU and US regions</li>
        <li><strong>Frontend (Next.js)</strong>: Vercel — edge CDN with origin in customer-selected region</li>
        <li><strong>Database</strong>: Render PostgreSQL — managed, encrypted at rest, automated backups, point-in-time recovery to last 30 days</li>
        <li><strong>Cache</strong>: Render-managed Redis (fail-open by design)</li>
      </UL>
      <P>All providers are SOC 2 Type II audited (verifiable on each provider&apos;s trust page).</P>

      <H3>Network</H3>
      <UL>
        <li><strong>No direct internet access to database</strong> (private network within Render)</li>
        <li><strong>API and frontend</strong> are public-facing with WAF + DDoS protection at the provider layer</li>
        <li><strong>Internal admin endpoints</strong> require superuser role + IP allowlist (Enterprise tier)</li>
      </UL>

      <H3>Secrets</H3>
      <UL>
        <li><strong>Render env vars</strong> for all production secrets, encrypted at rest</li>
        <li><strong>No secrets in git history</strong> (verified by <Code>gitleaks</Code> pre-commit hook + CI)</li>
        <li><strong>Quarterly rotation</strong> of <Code>JWT_SECRET</Code>, database password, internal API keys</li>
        <li><strong>On-demand rotation</strong> for any suspected leak</li>
        <li><strong>Per-customer API keys</strong> (<Code>HK_live_*</Code>) are bcrypt-hashed; plaintext shown to Customer once at creation</li>
      </UL>

      <H3>Logging and monitoring</H3>
      <UL>
        <li><strong>Sentry</strong> for application errors and performance traces</li>
        <li><strong>Render-native</strong> infrastructure metrics</li>
        <li><strong>PII redaction</strong> in error reports (configured at the Sentry integration layer)</li>
        <li><strong>Audit ledger</strong> (separate from operational logs) is the source of truth for governance events</li>
        <li><strong>No customer business data</strong> is ever sent to Sentry; only stack traces, request paths, and identifiers</li>
      </UL>

      <H2>5. Operational security</H2>

      <H3>Change management</H3>
      <UL>
        <li>All code changes via pull request</li>
        <li>Required: minimum one reviewer, all CI checks green</li>
        <li>Architecture freeze: any change to a frozen file requires an Architecture Decision Record</li>
        <li>Pre-commit hooks: lint, type check, secret scan</li>
        <li>CI gates: ruff, pytest, tsc --noEmit, next build, Playwright E2E (master/dev only)</li>
      </UL>

      <H3>Access control (employees)</H3>
      <UL>
        <li><strong>SSO</strong> for all employee tools (1Password, GitHub, Render, Vercel)</li>
        <li><strong>MFA</strong> required everywhere it&apos;s offered</li>
        <li><strong>Least privilege</strong>: developers do not have write access to production database</li>
        <li><strong>Production access</strong> is by emergency procedure, logged, and reviewed</li>
        <li><strong>Off-boarding</strong> within 1 business day of departure (immediate for involuntary)</li>
      </UL>

      <H3>Vendor risk management</H3>
      <UL>
        <li>Sub-processors evaluated on: SOC 2 / ISO 27001, DPA quality, data residency, breach history, financial stability</li>
        <li>Annual review; failure to maintain certifications triggers replacement</li>
        <li>Sub-processor list is <strong>public</strong> with <strong>30-day</strong> change notice</li>
      </UL>

      <H3>Backup and recovery</H3>
      <UL>
        <li><strong>Continuous WAL archiving</strong> + <strong>nightly base backup</strong> (Render-native)</li>
        <li><strong>Weekly off-platform encrypted copy</strong> to a non-Render cloud (defense against single-vendor failure)</li>
        <li><strong>Quarterly restore drill</strong> with hash-chain integrity verification post-restore</li>
        <li><strong>RTO 4h critical / RPO 15min critical</strong> for the application</li>
      </UL>

      <H2>6. Compliance footprint</H2>
      <StatusTable rows={[
        { label: "SOC 2 Type II", value: <span><Pill tone="warn">In progress</Pill> Q3 2026 target — readiness attestation available</span> },
        { label: "ISO 27001", value: <span><Pill tone="muted">Roadmap</Pill> Post-Series A</span> },
        { label: "GDPR", value: <span><Pill tone="ok">Compliant</Pill> DPA + SCCs Module Two + UK Addendum</span> },
        { label: "CCPA / CPRA", value: <span><Pill tone="ok">Compliant</Pill> DPA §13 Service Provider terms</span> },
        { label: "OWASP ASVS L2", value: <span><Pill tone="info">Annual</Pill> External pen-test summary on request under NDA</span> },
        { label: "IFRS 9 / ASC 815", value: "Customer-implemented; platform supports both via Hedge Effectiveness module" },
        { label: "EMIR Refit", value: "Customer-implemented; platform supports submission via Reg-reporting module" },
        { label: "MiFID II best-ex", value: "Customer-implemented; platform provides Pre-Trade TCA" },
      ]} />

      <H2>7. What we do NOT do</H2>
      <P>
        This list is part of the security posture. The shortest path to a security incident is offering features that increase blast radius without a clear customer need.
      </P>
      <UL>
        <li>We do <strong>not</strong> train ML models on customer data — there is no ML in the product</li>
        <li>We do <strong>not</strong> sell or share customer data with third parties for any purpose</li>
        <li>We do <strong>not</strong> execute trades on behalf of customers (out of v1 scope by design)</li>
        <li>We do <strong>not</strong> allow customer data to leave its selected residency region</li>
        <li>We do <strong>not</strong> use cross-site tracking, advertising pixels, or third-party analytics on the customer-facing app</li>
        <li>We do <strong>not</strong> offer SSH or similar shell access to customer environments</li>
        <li>We do <strong>not</strong> retain customer data past the contractual retention period</li>
        <li>We do <strong>not</strong> allow ORDR staff to write to a customer&apos;s production tenant during onboarding (audit posture)</li>
      </UL>

      <H2>8. Open questions / known limitations</H2>
      <P>We publish what isn&apos;t yet covered, because honesty here is what makes the rest credible.</P>
      <StatusTable rows={[
        { label: "SOC 2 Type II report", value: <span><Pill tone="warn">In progress</Pill> Q3 2026</span> },
        { label: "ISO 27001 certification", value: <span><Pill tone="muted">Not started</Pill> Post-Series A</span> },
        { label: "FedRAMP / HIPAA", value: <span><Pill tone="muted">Not pursued</Pill> Out of scope unless sustained customer need emerges</span> },
        { label: "Multi-region active-active", value: <span><Pill tone="muted">Not implemented</Pill> Out of v1 scope; documented in BC plan</span> },
        { label: "CMEK / BYOK", value: <span><Pill tone="info">Roadmap</Pill> Enterprise add-on Q4 2026</span> },
        { label: "Bug bounty", value: <span><Pill tone="muted">Not yet</Pill> Public disclosure works for now; bounty after SOC 2</span> },
        { label: "Source code escrow", value: <span><Pill tone="ok">Available</Pill> Enterprise rider via Iron Mountain or EscrowTech</span> },
      ]} />

      <H2>Contact</H2>
      <UL>
        <li>Security questions, NDA-gated documents: <a href="mailto:security@ordrtreasuryfx.com" style={{ color: "#1E3A5F" }}>security@ordrtreasuryfx.com</a></li>
        <li>Vulnerability disclosure: <a href="mailto:security@ordrtreasuryfx.com" style={{ color: "#1E3A5F" }}>security@ordrtreasuryfx.com</a></li>
        <li>Privacy, rights requests: <a href="mailto:dpo@ordrtreasuryfx.com" style={{ color: "#1E3A5F" }}>dpo@ordrtreasuryfx.com</a></li>
      </UL>
    </TrustDocLayout>
  );
}
