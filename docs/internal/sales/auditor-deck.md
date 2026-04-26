# ORDR TreasuryFX — Auditor / Procurement Deck

**Format:** 8 slides, ~15 minutes
**Audience:** Internal audit, external audit (Big 4 senior/manager/partner), IT procurement, CISO
**Goal of meeting:** Unblock the procurement gate after the treasurer is already sold

---

## Slide 1 — Cover + scope

**Headline:** ORDR TreasuryFX — Audit & Security Overview
**Sub:** Scope of this document.

**Document scope:**
- System architecture
- Data flow (input → engine → ledger → reports)
- Security controls (RBAC, auth, encryption, rate limiting)
- Compliance posture (SOC 2, GDPR, OWASP)
- Audit evidence package
- Hash chain verification
- Reference contacts + document links

**Footer:** *Document version: [v1.0] · Date: [Today] · Confidential — for evaluation use*

---

## Slide 2 — Architecture

**Headline:** Standard, boring, defensible.

**Diagram (top to bottom):**

```
┌──────────────────────────────────────────────────┐
│   Frontend: Next.js 15.5 + React 19  (Vercel)    │
└──────────────────────────────────────────────────┘
              │ HTTPS · JWT · CSRF token
              ▼
┌──────────────────────────────────────────────────┐
│ Backend: FastAPI (Python 3.12) (Render.com)      │
│  ┌─────────────────────────────────────────────┐ │
│  │ Audit middleware → Rate limit → Auth        │ │
│  └─────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────┐ │
│  │ Engine_v1 kernel (46 modules, deterministic)│ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
              │
        ┌─────┴─────┐
        ▼           ▼
┌──────────────┐ ┌──────────────┐
│ PostgreSQL   │ │ Redis cache  │
│ (Render PG)  │ │ (fail-open)  │
│ WORM tables  │ │              │
│ + JSONB      │ │              │
└──────────────┘ └──────────────┘
              │
              ▼
┌──────────────────────────────────────────────────┐
│ External: ERP (QBO/Xero/NS/Sage/D365), IBKR,     │
│           SWIFT, ESMA reporting endpoints        │
└──────────────────────────────────────────────────┘
```

**Footer:** *No microservices. No exotic dependencies. Two stateless services + one database.*

---

## Slide 3 — Data flow

**Headline:** From input to audit-ready evidence.

**Flow diagram (left to right):**

```
[Tenant input]
      │
      ▼
[Validator (fail-closed)]
      │
      ▼
[Engine_v1 kernel — pure deterministic compute]
      │
      ▼
[RunEnvelope: hashed (SHA-256), signed, persisted]
      │
      ├──► [calculation_runs (WORM)]
      ├──► [audit_events (WORM)]
      └──► [policy_revisions (WORM)]
              │
              ▼
[Hash chain verifier (cron, daily)]
              │
              ▼
[Audit Lab export: PDF + JSON + CSV bundle]
```

**Footer:** *Every box logs every transition. Every transition is signed. Every signature is verified daily.*

---

## Slide 4 — Security controls

**Headline:** Defense in depth — application, data, network.

**Controls table:**

| Layer | Control | Implementation |
|---|---|---|
| **Auth** | JWT HS256 | 30-min access / 7-day refresh |
| **Auth** | Password storage | bcrypt (cost 12) |
| **Auth** | API keys | bcrypt-hashed secret, `HK_live_` prefix |
| **Authz** | RBAC | 9 roles × 41 permissions, hierarchy 0–15 |
| **Authz** | Separation of Duties | Same user cannot make + check |
| **Anti-CSRF** | Double-submit cookie | `csrf_token` + `X-CSRF-Token` header |
| **Anti-DoS** | Rate limit | TokenBucket, 60 req/min per user/IP |
| **Headers** | Security headers | nosniff, DENY frame, strict-origin-when-cross-origin |
| **CORS** | Origin allowlist | Per-environment, no wildcards in prod |
| **Encryption (transit)** | TLS 1.3 | Render + Vercel managed |
| **Encryption (at rest)** | AES-256 | Render PG managed |
| **Encryption (per-tenant)** | Fernet | `CONNECTOR_ENCRYPTION_KEY`, rotation supported |
| **Audit** | WORM tables | NO UPDATE / NO DELETE enforced at PG level |
| **Audit** | Hash chain | SHA-256 per-tenant, GENESIS = 64 zeros |
| **Audit** | Verifier cron | Daily; alerts on chain break |

**Footer:** *Full control list in `docs/security/owasp-zap-baseline-report.md` and `docs/compliance/soc2-controls-matrix.md`.*

---

## Slide 5 — Compliance posture

**Headline:** Procurement-ready, with the receipts.

**Compliance status:**

| Framework | Status | Evidence document |
|---|---|---|
| **SOC 2 Type II** | Audit in progress (6-month observation) | `docs/compliance/soc2-controls-matrix.md` |
| **GDPR** | DPA available, data subject rights wired | `docs/compliance/gdpr-dpa-status.md` |
| **OWASP ASVS** | Level 2 verified | `docs/security/owasp-zap-baseline-report.md` |
| **ISO 27001** | Controls mapped (not certified) | `docs/compliance/iso27001-mapping.md` *(if exists; else mark "in progress")* |
| **Pen test** | Annual third-party | [Provider name] · [Last test date] |
| **DPIA** | Available on request | — |
| **Sub-processor list** | Public, versioned | [Marketing site URL when live] |
| **Vendor registry** | Maintained | `docs/compliance/vendor-registry.md` |
| **Cyber insurance** | $[X]M policy | [Provider, policy #, coverage details] |

**Footer:** *Security questionnaire responses (SIG Lite, CAIQ, VSAQ): see `docs/internal/sales/security-questionnaire.md`.*

---

## Slide 6 — Audit evidence package walkthrough

**Headline:** What an external auditor receives.

**Bundle contents (per audit period):**

1. **`runs.csv`** — every calculation run, with timestamp, inputs hash, outputs hash, parent hash
2. **`runs.jsonl`** — full RunEnvelope per row (inputs, outputs, signatures, policy version)
3. **`policy-revisions.csv`** — policy versions in effect during the period, with maker + checker user IDs
4. **`audit-events.csv`** — every state transition, every approval, every config change
5. **`hash-chain-proof.txt`** — chain verification result + last verified hash
6. **`README.pdf`** — 4-page bundle explainer for the auditor (chain semantics, replay instructions)

**Replay instructions:**
- Each run can be re-executed with the same inputs and the same policy version
- Outputs must match byte-for-byte
- Mismatches indicate either: tampering (chain break) or engine version drift (CHANGELOG diff resolves)

**Footer:** *Auditor onboarding takes 30 minutes. Most Big 4 senior managers we've walked through this have asked us to demo it to their colleagues.*

---

## Slide 7 — Hash chain proof-of-concept

**Headline:** What "tamper-evident" actually means.

**Worked example:**

```
GENESIS:    0000000000000000000000000000000000000000000000000000000000000000

Run #1 (timestamp T0):
  inputs_hash = sha256(inputs_T0)
  outputs    = engine_v1.compute(inputs_T0)
  outputs_hash = sha256(outputs)
  envelope_T0 = {parent: GENESIS, ...}
  chain_hash_T0 = sha256(envelope_T0)
                = ab3c...f291

Run #2 (timestamp T1):
  envelope_T1 = {parent: chain_hash_T0, ...}
  chain_hash_T1 = sha256(envelope_T1)
                = 7e44...d8a1

If anyone alters Run #1 retroactively:
  → chain_hash_T0 changes
  → envelope_T1.parent no longer matches the recomputed hash
  → verifier detects break within 24h
  → alert fires to audit + ops
```

**Why this matters:**
- A regulator asks: "Has this calculation been altered since it was made?" — you can prove it has not.
- An auditor asks: "Reproduce a calculation from 18 months ago" — you can, byte-for-byte.
- An adversary tries to change history — the system tells on them within a day.

**Footer:** *Chain verification cron is open-source: `backend/app/jobs/hash_chain_verifier.py`.*

---

## Slide 8 — Q&A + reference contacts

**Headline:** Who to talk to.

**Contacts:**
- **Security inquiries:** security@ordrtreasuryfx.com (PGP key on website)
- **Compliance / DPA:** compliance@ordrtreasuryfx.com
- **Procurement:** procurement@ordrtreasuryfx.com
- **Founder direct:** [Your name + email + phone]

**Documents (provided in evaluation pack):**
- This deck (PDF)
- SOC 2 controls matrix
- GDPR DPA template
- OWASP ZAP baseline report
- Sub-processor list
- Vendor registry summary
- MSA + Order Form templates
- Reference architecture (1-page PDF)

**Footer:** *We respond to security questionnaires within 5 business days. SLA on RFI responses: 10 business days.*

---

## Tips for delivering this deck

1. **Lead with the architecture (Slide 2), not the controls.** Auditors/CISOs want to know what they're securing first.
2. **Slide 7 (hash chain) is your trump card.** Practice it. Walk through it slowly. Pause after the verifier-detects-break line.
3. **Don't oversell SOC 2.** Be honest if it's "Type II in progress" — auditors respect honesty about audit timing more than they respect optimistic phrasing.
4. **Have the actual documents available.** This deck is the cover; the documents are the deal.
5. **If asked about a control you don't have, say so.** A "not yet — here's our roadmap and timeline" beats a fabricated answer every time.
