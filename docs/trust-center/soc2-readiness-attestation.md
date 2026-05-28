# SOC 2 Type II Readiness Attestation

**Issued:** 2026-04-25 (last refreshed 2026-05-27)
**Issued by:** ORDR TreasuryFX (self-attestation; not a third-party audit report)
**Audience:** Customer security teams, procurement, compliance reviewers
**Validity:** This document is updated monthly until the Type II report is issued, at which point it is superseded.
**This is not a substitute for a SOC 2 report.** It is a structured statement of which controls are operating today, which evidence exists, and where the gaps are. Honest, dated, signed.

**What changed since last refresh (2026-04-25 → 2026-05-27):**
- Added operating evidence of CC7.5 (Recovery from incidents) — 2026-05-13 → 2026-05-16 P1 RLS incident detected, root-caused, and resolved in 4 minutes after detection. Full post-mortem committed same day.
- Added new gap: RISK-OPS-MON-01 — Sentry 5xx alert rule + Render auto-rollback are not yet wired at the dashboard layer. Runbook with step-by-step checklist landed 2026-05-27 (`docs/runbooks/ops-monitoring.md`). The 2026-05-13 incident is what surfaced this gap.
- CC6 controls strengthened structurally: migration `0036_force_rls_tenant_context` + two startup guards (`assert_routes_have_canonical_auth`, `assert_api_key_routes_safe`) prevent the "parallel auth helper bypasses RLS" class of bug at app startup.

---

## Why this document exists

Customers need to make a buy decision before our Type II report is in hand. Three options exist:

1. **Wait for Type II** — kicks the customer's procurement timeline by 6+ months
2. **Trust our marketing** — not a real option for a serious enterprise procurement team
3. **Read this** — a structured, verifiable picture of where we are, with evidence we can show

This document supports Option 3. It is paired with the [SOC 2 contingency clause](../legal/order-form-template.md#9-special-terms-if-any) in the Order Form: customer's right to terminate without penalty if Type II is not delivered by an agreed date.

---

## Trust Services Criteria — control-by-control status

The following table walks through the **Common Criteria (CC)** + **Availability (A)** + **Confidentiality (C)** criteria. We exclude Privacy (covered separately under GDPR) and Processing Integrity (deferred to v2 audit). For each criterion we state: implemented, evidence type, and next step.

Status legend:
- **✓ Implemented** — control is in place and operating
- **◐ Partial** — control exists but evidence collection or formalization is incomplete
- **○ Planned** — control will be in place before Type II observation begins

### CC1 — Control Environment

| Control | Status | Evidence | Next |
|---|---|---|---|
| CC1.1 Integrity & ethics policy | ✓ | Code of conduct in employee handbook | Annualize sign-off process |
| CC1.2 Board oversight (or equivalent) | ◐ | Founder + advisor as informal board | Formalize advisory board minutes |
| CC1.3 Org structure & authorities | ✓ | Org chart, role definitions, RACI | — |
| CC1.4 Personnel competence | ✓ | Hiring rubric, performance review | — |
| CC1.5 Accountability for controls | ✓ | Control owner assigned per control | Quarterly attestation |

### CC2 — Communication & Information

| Control | Status | Evidence | Next |
|---|---|---|---|
| CC2.1 Internal communication | ✓ | Slack #engineering channel + standups + retro cadence | — |
| CC2.2 External communication | ✓ | Status page, security@ inbox, status-page comms template | — |
| CC2.3 Security awareness training | ◐ | One-time orientation in place | Implement annual refresher + tracked completion |

### CC3 — Risk Assessment

| Control | Status | Evidence | Next |
|---|---|---|---|
| CC3.1 Risk identification | ✓ | `OPEN_RISKS.md` register; quarterly review | — |
| CC3.2 Fraud risk consideration | ◐ | Separation of Duties + 4-eyes pipeline | Document fraud-risk-specific controls |
| CC3.3 Significant change ID | ✓ | Architecture freeze + ADR process | — |

### CC4 — Monitoring Activities

| Control | Status | Evidence | Next |
|---|---|---|---|
| CC4.1 Ongoing monitoring | ✓ | Sentry, uptime monitoring, hash-chain integrity job | — |
| CC4.2 Communication of deficiencies | ✓ | Incident response process, post-mortem cadence | — |

### CC5 — Control Activities

| Control | Status | Evidence | Next |
|---|---|---|---|
| CC5.1 Selection of controls | ✓ | This document | — |
| CC5.2 Technology control activities | ✓ | CI gates, branch protection, code review | — |
| CC5.3 Policies & procedures | ◐ | Engineering rules in `.claude/rules/` + runbooks | Formalize as numbered policy documents |

### CC6 — Logical & Physical Access

| Control | Status | Evidence | Next |
|---|---|---|---|
| CC6.1 Logical access — provisioning | ✓ | SSO + MFA + role-based provisioning | — |
| CC6.2 Logical access — credentials | ✓ | bcrypt + JWT + rotation policy | — |
| CC6.3 Logical access — authorization | ✓ | RBAC 9×41 + fail-closed; **DB-level tenant isolation** via PostgreSQL `FORCE ROW LEVEL SECURITY` (migration `0036_force_rls_tenant_context`) with two startup guards (`assert_routes_have_canonical_auth`, `assert_api_key_routes_safe`) that block app startup if any route is missing canonical auth | — |
| CC6.4 Physical access | n/a | Cloud-only; physical controls inherited from sub-processors | — |
| CC6.5 Logical access termination | ✓ | Off-boarding within 1 business day | — |
| CC6.6 External authentication | ✓ | TLS 1.3, MFA required for admin | — |
| CC6.7 Transmission of confidential info | ✓ | TLS in transit; AES-256 at rest | — |
| CC6.8 Malicious code prevention | ✓ | Dependency scanning + container scanning | — |

### CC7 — System Operations

| Control | Status | Evidence | Next |
|---|---|---|---|
| CC7.1 Vulnerability management | ✓ | gitleaks, Dependabot, pip-audit, npm audit, annual pen-test | — |
| CC7.2 System monitoring | ◐ | Sentry DSN wired + Render-native + uptime monitoring; **5xx alert rule + auto-rollback toggle pending** — see RISK-OPS-MON-01 + `docs/runbooks/ops-monitoring.md` | Wire Sentry rule + Render auto-rollback per runbook |
| CC7.3 Incident response | ✓ | [Incident response plan](../ops/incident-response-plan.md); **operating evidence**: 2026-05-13 P1 RLS incident — see `docs/incidents/2026-05-16-rls-set-local-bind-params.md` | Annual tabletop |
| CC7.4 Incident communication | ✓ | Status page + customer comms template | — |
| CC7.5 Recovery from incidents | ✓ | [BC plan](../ops/business-continuity.md); 2026-05-13 incident resolved 4 min after detection via `set_config()` fix in commit `151c591` | Quarterly drill |

### CC8 — Change Management

| Control | Status | Evidence | Next |
|---|---|---|---|
| CC8.1 Change authorization | ✓ | PR review + ADR process for frozen files | — |
| CC8.2 Change testing | ✓ | CI: ruff + pytest + tsc + next build + Playwright | — |
| CC8.3 Change implementation | ✓ | Auto-deploy with rollback path | — |

### CC9 — Risk Mitigation

| Control | Status | Evidence | Next |
|---|---|---|---|
| CC9.1 Risk mitigation activities | ✓ | This entire document | — |
| CC9.2 Vendor risk management | ✓ | Sub-processor evaluation + annual review | Formalize vendor questionnaire log |

### A — Availability

| Control | Status | Evidence | Next |
|---|---|---|---|
| A1.1 Capacity planning | ✓ | Render auto-scaling; Postgres metrics | — |
| A1.2 Backup & recovery | ✓ | Continuous WAL + nightly + weekly off-platform; quarterly drill | — |
| A1.3 Environmental protection | n/a | Cloud-inherited from sub-processors | — |

### C — Confidentiality

| Control | Status | Evidence | Next |
|---|---|---|---|
| C1.1 Identification & maintenance | ✓ | Data classification matrix in [security overview](security-overview.md) | — |
| C1.2 Disposal of confidential info | ✓ | DPA-defined retention + deletion on termination | Automate proof-of-deletion attestation |

---

## Summary — what's open at audit time

The items currently marked **◐ Partial** or with a "Next" entry are the gaps to close before the Type II observation period begins. Concretely:

1. **Annualized sign-off** on the integrity & ethics policy (CC1.1) — adds a tracked artifact
2. **Advisory board minutes** (CC1.2) — formalize what already happens informally
3. **Annual security awareness training** with completion tracking (CC2.3)
4. **Fraud-risk control documentation** (CC3.2) — connect 4-eyes to fraud-risk language
5. **Numbered policy documents** for engineering rules (CC5.3) — they exist as content; need the formal naming
6. **Vendor questionnaire log** (CC9.2) — already evaluating; need a tracked log
7. **Automated proof-of-deletion attestation** (C1.2) — strengthens C1.2 evidence
8. **RISK-OPS-MON-01 — alert rules and auto-rollback** (CC7.2) — Sentry 5xx alert rule + Render auto-rollback toggle. Runbook with step-by-step checklist landed 2026-05-27 (`docs/runbooks/ops-monitoring.md`); dashboard wiring pending. Of the eight gaps, this is the only one with material customer-facing impact — the 2026-05-13 incident showed that without alert rules, a fully-degraded prod can run for 3 days before detection.

Eight gaps total. Gaps 1–7 are about formalization and evidence-collection — the controls exist; the audit-ready paper trail needs three months of consistent operation. Gap 8 (RISK-OPS-MON-01) is a real operational gap with a written closeout plan.

---

## How to use this document

| You are… | Do this |
|---|---|
| A prospect's procurement team | Use this in lieu of a SOC 2 report; pair with the [contingency clause](../legal/order-form-template.md#9-special-terms-if-any) |
| A prospect's CISO | Read alongside the [security overview](security-overview.md); request the assurance evidence pack under NDA |
| A prospect's auditor | Treat this as ORDR's self-assessment; full evidence is available under NDA |
| An investor doing diligence | This is a meaningful signal of operational maturity; ask to see the underlying evidence pack |

---

## Signed

This attestation is issued in good faith. We are not lawyers, and this is not a legal compliance certification. Misstatements would be both an integrity issue and a contract issue. We have reviewed every row and stand behind every status mark.

**ORDR TreasuryFX**
Founder + DPO + Lead Engineer (signatures captured in the issued PDF)
Originally signed 2026-04-25; refreshed 2026-05-27.

Next review: 2026-06-27
