# Customer IT Prep Checklist

**Audience:** Customer's IT / security / infrastructure team
**Purpose:** What your team needs to prepare for an ORDR TreasuryFX deployment, before kickoff
**Time investment:** ~4–6 hours of IT time across the entire onboarding

If you're an evaluator from IT or security, this is also a useful filter on whether the project is realistic. Most items here are routine for any modern SaaS deployment.

---

## Before contract signing (security review)

These items typically happen during procurement / legal review, before the Order Form is signed.

- [ ] Review **DPA template** (`docs/legal/dpa.md`) and confirm the data-processing terms work for your organization
- [ ] Review **sub-processor list** (`docs/legal/sub-processors.md`) and confirm none are blocked by your vendor policy
- [ ] Confirm **data residency** — choose EU (Frankfurt) or US (us-east-1)
- [ ] Review **privacy notice** (`docs/legal/privacy-notice.md`) for GDPR / CCPA scope
- [ ] Request **assurance evidence pack** under NDA: pen-test summary, threat model, BC/DR plan, SOC 2 readiness attestation, sub-processor list with last review date
- [ ] (Optional) Have your auditor or security team review the **threat model** (`docs/architecture/threat-model.md`)
- [ ] Sign **MSA + DPA + Order Form** as a single bundle

ORDR can support each of these within 2 business days.

---

## Pre-kickoff (Week 0 of the 90-day plan)

### Identify roles

- [ ] Confirm **IT/Security sponsor** name and email — single point of accountability
- [ ] Confirm **business sponsor** (Treasurer or CFO) — owns the workflow side
- [ ] Confirm **audit/compliance partner** — internal audit or controller's office
- [ ] Confirm **decision authority** for production cutover (the business sponsor by default)

### Network and access

- [ ] Allow outbound HTTPS to `*.ordrtreasuryfx.com` from any user device that needs to access the platform — should be the default in any modern corporate network
- [ ] (Optional) IP allowlist your office egress range with ORDR if you prefer additional restriction on admin access — supported on Enterprise tier
- [ ] No inbound network changes are required — ORDR is fully cloud-hosted

### SSO planning (Enterprise tier — recommended)

- [ ] Identify your IdP — Azure AD / Entra ID, Okta, Google Workspace, OneLogin, or other SAML 2.0 / OIDC provider
- [ ] Identify your group structure — which AD/IdP groups should map to which ORDR roles (Treasurer, Approver, Controller, Auditor, Admin)
- [ ] Schedule a 60-min SSO setup call in Week 1 of onboarding
- [ ] Confirm ability to provision **a service account** for SCIM auto-provisioning (optional, available)

### MFA

- [ ] Confirm whether MFA is enforced via your IdP (preferred) or via ORDR's built-in MFA
- [ ] If via IdP, confirm the conditional-access policies that should apply to ORDR sign-ins

---

## During onboarding (Weeks 1–4)

### Data sources

- [ ] Identify how exposure data will reach ORDR. Choose one or more:
  - [ ] **ERP connector** (QBO, Xero, NetSuite, Sage Intacct, Dynamics 365) — credentials needed; we recommend read-only where the ERP supports it
  - [ ] **Bank file drop** — SFTP credentials or shared S3 bucket
  - [ ] **CSV upload** — manual, for low-volume customers
  - [ ] **REST API** — push from Customer's existing TMS / treasury workstation
- [ ] For each ERP integration, confirm:
  - Read-only credentials available? (preferred)
  - OAuth flow approved by IT? (most ERPs require IT pre-authorization)
  - Specific entities, currencies, and accounts in scope?
- [ ] Provide a **sample exposure dataset** (synthetic or anonymized) to validate the integration end-to-end

### Banking channels

ORDR generates messages (MT103, pain.001) but does not transmit them to banks directly. Customer's existing channel governs.

- [ ] Confirm how MT103 / pain.001 messages will reach your bank — usually:
  - Customer's existing SWIFT bureau or service provider (most common)
  - Direct upload to bank portal
  - Bank-provided file drop
- [ ] Confirm bank's authorization model for incoming messages — typically a separate sign-off in the bank's portal regardless of ORDR
- [ ] (Optional) If a test message channel exists with the bank, schedule a Week 6–8 test send

### Email deliverability

- [ ] Allowlist the transactional email sender domain (currently `mail.ordrtreasuryfx.com` — ORDR will share specific records during onboarding)
- [ ] Add SPF / DKIM allowlists if your email security uses them
- [ ] Test verification email delivery to one user as a smoke test in Week 1

### User provisioning

- [ ] Plan for **at least one IT-controlled admin account** that is separate from the Treasurer's day-to-day account — for SoD on the platform itself
- [ ] If using SSO: pre-provision the IdP groups and the user-to-group mapping
- [ ] If not using SSO: prepare a list of users (name, email, role) — admin invites them via the platform

---

## Production cutover (Week 9–10)

- [ ] Confirm **change-management ticket** filed in your ITSM (ServiceNow, Jira Service Management, etc.)
- [ ] Confirm **rollback plan**: in our case, "continue using current process" — ORDR is additive, not replacing critical infrastructure
- [ ] Confirm **incident contacts** on both sides — who pages whom for what severity
- [ ] (Optional) Pre-stage the **status page** subscription so ITOps gets ORDR incident notifications

---

## Ongoing operations

After cutover, IT involvement is light. Most operational matters are handled in the platform by the Treasurer / Controller. IT touch-points:

- **User off-boarding** — when a user leaves your organization, revoke via SSO (or via the platform if not using SSO). ORDR off-boards within 1 business day of receiving notice; immediate revocation possible via the admin UI.
- **Quarterly access review** — ORDR provides a one-click export of `users-roles.csv` and `access-changes.csv` for your standard quarterly access review.
- **Annual SSO certificate rotation** — coordinate with ORDR; ~30 minutes per rotation.
- **Any sub-processor change** — ORDR notifies you 30 days in advance of any new sub-processor that will Process Customer Data; objection process documented in DPA.
- **Any incident** — status page + direct email per the [incident response plan](../../ops/incident-response-plan.md).

---

## What ORDR does NOT require from your IT team

These are common asks from less-mature SaaS vendors. ORDR doesn't require any of them:

- **No** VPN client install on user machines
- **No** browser plugin or extension
- **No** local agent or daemon
- **No** firewall rule to allow inbound connections
- **No** AD service account for cross-tenant operations
- **No** access to your internal DNS or naming services
- **No** Customer-side PKI involvement
- **No** "phone home" telemetry from user machines
- **No** modifications to user endpoints whatsoever

If a vendor asks for these, that's a different posture. ORDR is a pure SaaS browser app + API.

---

## Common IT questions and short answers

**Where does our data live?**
EU (Frankfurt) or US (us-east-1), your choice at signing. Data does not leave the chosen region.

**What encryption do you use?**
TLS 1.3 in transit. AES-256 at rest. Bcrypt for passwords. SHA-256 for the audit hash chain.

**Who has access to our data inside ORDR?**
A small engineering team has emergency access to production for incident response, logged and reviewed. ORDR staff do not write to your tenant during normal operations or onboarding (audit posture).

**Can you delete our data?**
Yes — subject to the contractual retention period. WORM tables are retained per the regulatory minimums (typically 7 years). Operational data deletes within 90 days of contract termination.

**Do you train ML models on our data?**
No. We don't have ML in the product, and we don't use customer data for any model training.

**SOC 2?**
Type II in progress, target Q4 2026 delivery. Bridge document: [SOC 2 readiness attestation](../../trust-center/soc2-readiness-attestation.md).

**ISO 27001?**
Not yet. Roadmap post-Series A.

**Pen test?**
Annual external. Executive summary on request under NDA. [Template here](pentest-summary-template.md).

**What happens if you go out of business?**
Documented in [business continuity](../../ops/business-continuity.md). Includes 180-day notice, full data export, source-code escrow for Enterprise tier.

**Can we audit you?**
Yes — annually, on-site, with 30 days' notice. SOC 2 Type II report (when delivered) plus this trust center generally satisfies the requirement absent a material change.

---

## Total IT time estimate

| Phase | IT-hours estimate |
|---|---|
| Pre-contract security review | 2–4 hours (legal/security teams skim DPA, sub-processors, threat model) |
| SSO setup | 60–90 minutes |
| Network / email allowlisting | 30 minutes |
| Cutover-day support | 1 hour |
| Quarterly ongoing | 30–60 minutes |
| Annual SSO cert rotation | 30 minutes |
| Annual access review | 30–60 minutes |

Total to first production hedge: **4–6 hours of IT time**. Most of that is review, not configuration.

This is the realistic number. If you're hearing larger numbers from a TMS incumbent, that's not because they're more secure — it's because they're more complicated.
