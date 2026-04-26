# ORDR TreasuryFX — Prospect Demo Deck

**Format:** 15 slides, ~30 minutes (15 min present, 10 min live demo, 5 min Q&A)
**Audience:** Treasurer, CFO, Risk Officer, Controller — corporate buying committee
**Goal of meeting:** Book a 60-minute technical deep-dive + send the security pack

---

## Slide 1 — Cover

**Headline:** Audit-grade FX hedging.
**Sub:** Engine, governance, and reporting in one platform.
**Footer:** ORDR TreasuryFX · ordrtreasuryfx.com · [Your Name] · [Email]

**Speaker notes:**
> "Thanks for the time. I'll spend 15 minutes on the platform, 10 on a live walkthrough, and leave 5 for your questions. Stop me whenever — I'd rather answer the question on your mind than finish my slides."

---

## Slide 2 — The pain

**Headline:** Your hedge accounting is in Excel. Your audit defense is screenshots.

**Three quotes (use real ones if you have them, otherwise composite):**
- *"We re-create our IFRS 9 effectiveness tests every quarter. Two analysts, two weeks."* — Treasurer, €400M revenue manufacturer
- *"Our auditor asked us to reproduce a hedge calculation from 18 months ago. It took six weeks."* — Group Controller, $1.2B SaaS
- *"EMIR reporting penalties are up. We log everything in Outlook."* — Compliance officer, mid-cap exporter

**Speaker notes:**
> "Every treasury we talk to has the same stack: a TMS that handles cash, a spreadsheet that handles hedge accounting, and email threads that handle governance. That works until something breaks."

---

## Slide 3 — Cost of the status quo

**Three numbers, large:**
- **240 hrs/yr** — re-creating hedge effectiveness tests
- **$80k–$300k** — average EMIR/MiFID II reporting penalty
- **6+ weeks** — average time to reproduce a hedge calculation for audit

**Bottom strip:** *"That's $120k/year before you count the audit fee inflation."*

**Speaker notes:**
> "These are the numbers we hear most often. None of them are catastrophic alone — but together, they're a 6-figure annual tax on the treasury team."

---

## Slide 4 — What ORDR is

**Headline:** One platform. From exposure to audit-ready evidence.

**Diagram (left to right, 5 boxes):**
`Exposure` → `Pre-Trade` → `Execution` → `Hedge Accounting` → `Audit & Reporting`

**Sub-bullets under the diagram:**
- Built on a deterministic engine — same inputs, same outputs, forever
- WORM-audited — every calculation is signed and replayable
- 4-eyes governance built in — no spreadsheet, no email approvals

**Speaker notes:**
> "ORDR is not a TMS — it doesn't replace Kyriba or GTreasury for cash. It replaces the spreadsheet-and-email layer that lives next to your TMS for the actual hedge work."

---

## Slide 5 — The engine

**Headline:** Deterministic by design. Auditable by default.

**Visual:** Schematic of `engine_v1/` kernel — input validation → kernel computation → RunEnvelope (signed, hashed, stored).

**Three callouts:**
- **46 modules**, 100% pure functions, no side-effects
- **R1–R8 risk taxonomy** baked in (cash flow, FV, NIB, basis, translation, counterparty, liquidity, settlement)
- **No ML, no auto-learning** — every decision can be defended in front of a regulator

**Speaker notes:**
> "This is the part that surprises people. Most modern platforms lean on ML for hedge optimization. We deliberately don't. When your auditor asks 'why did you choose this hedge?' — you can show them the rule. Not a confidence interval."

---

## Slide 6 — Hedge accounting (IFRS 9 / ASC 815)

**Headline:** Effectiveness testing, designation, and journal entries — without leaving the platform.

**Screenshot:** Hedge Effectiveness page (`/hedge-effectiveness`) with passing test, prospective + retrospective metrics, designation badge.

**Bullets:**
- Prospective + retrospective effectiveness, configurable thresholds
- Designation lifecycle: NEW → DESIGNATED → DEDESIGNATED with full WORM trail
- GL postings export per ERP (QBO / Xero / NetSuite / Sage / Dynamics)

**Speaker notes:**
> "If your team currently does this in Excel, this slide alone is the case for ORDR."

---

## Slide 7 — Governance: tri-state pipeline + 4-eyes

**Headline:** SANDBOX → STAGING → LEDGER. Maker/checker enforced.

**Diagram:** Three-stage pipeline. SoD enforced between maker and checker.

**Bullets:**
- Same user cannot make AND approve a proposal — enforced in code
- 9 roles, 41 permissions, hierarchy 0–15
- Every state transition is logged, signed, and append-only

**Speaker notes:**
> "Treasury teams don't get audit findings because of bad math. They get findings because someone forgot to file an approval email. ORDR makes the approval the only path to production."

---

## Slide 8 — Audit: WORM + hash chain

**Headline:** Every calculation is signed. Every change is replayable.

**Visual:** Hash chain diagram — RunEnvelope → SHA-256 → next RunEnvelope. Per-tenant chain. Genesis hash = `0000…0000`.

**Bullets:**
- **WORM tables**: append-only, no UPDATE, no DELETE — enforced at DB level
- **Per-tenant hash chain** verified by scheduled cron — tampering detected within 24h
- **Audit Lab** export: PDF + JSON + CSV bundle ready for external audit

**Speaker notes:**
> "When a Big 4 partner sees the hash chain demo, that's usually the moment we get the budget conversation. They've never seen a treasury platform offer this."

---

## Slide 9 — Pre-Trade: TCA + Counterparty Scoring

**Headline:** Know your cost — and your bank — before you trade.

**Two screenshots side-by-side:**
- TCA — pre-trade cost estimate vs. mid-market reference
- Counterparty Hub — bank scoring heatmap (credit, liquidity, FX spread, settlement risk)

**Bullets:**
- Pre-trade cost estimate per venue and instrument
- Counterparty scoring updated daily, weighted by exposure
- Best-execution evidence captured automatically

**Speaker notes:**
> "MiFID II best-ex isn't optional. ORDR captures the evidence at the moment of decision, not retroactively."

---

## Slide 10 — Regulatory reporting

**Headline:** EMIR. MiFID II. CFTC. SWIFT. ISO 20022. One platform.

**Visual:** Output samples (small): EMIR XML with UTI stamp, MT103, pain.001.001.09 CBPR+

**Bullets:**
- UTI generation per ESMA spec
- ISO 20022 pain.001.001.09 CBPR+ payment instructions
- SWIFT MT103 for confirmation flows
- All submissions logged in WORM ledger

**Speaker notes:**
> "We see this most often in EU-domiciled treasuries. EMIR Refit deadlines have made this a hard requirement, not a nice-to-have."

---

## Slide 11 — Integrations

**Headline:** Plugs into your stack today.

**Logo wall (in three rows):**
- **ERP / Accounting:** QuickBooks, Xero, NetSuite, Sage Intacct, Microsoft Dynamics 365
- **Banking / Brokers:** IBKR, SWIFT, ISO 20022 banks
- **Identity:** SAML / OIDC SSO (Enterprise tier), Google, Microsoft

**Footer:** *"OAuth flows pre-built. Live in days, not months."*

**Speaker notes:**
> "All five ERPs ship with the platform. We don't charge per connector. Banking integrations expand quarterly — IBKR is live; the rest are on the public roadmap."

---

## Slide 12 — Security & compliance

**Headline:** Built to pass procurement.

**Compliance badges grid (icon + text):**
- SOC 2 Type II — audit in progress
- GDPR — DPA available
- OWASP ASVS Level 2 — verified
- ISO 27001 — controls mapped
- Pen test — annual third-party

**Side bullets:**
- JWT 30-min access / 7-day refresh, bcrypt passwords
- CSRF double-submit on all mutations
- Per-tenant encryption keys, Fernet rotation supported
- Rate limiting 60 req/min per user/IP
- WORM tables enforced at PostgreSQL level

**Speaker notes:**
> "We have a 40-page security pack. Send your IT team to the security page on our site or I'll email it to you today."

---

## Slide 13 — Pricing

**Headline:** Three tiers. No surprises.

**Three columns:**

| Starter | Professional | Enterprise |
|---|---|---|
| **$24k / yr** | **$72k / yr** | **From $144k / yr** |
| 1 entity | up to 5 entities | Unlimited |
| 500 trades/yr | 5,000 trades/yr | Unlimited |
| 5 users | 25 users | Unlimited |
| Hedge accounting ✓ | + ERP live | + Dedicated tenant DB |
| Audit Lab ✓ | + EMIR/MiFID/CFTC | + SAML SSO |
| 4-eyes ✓ | + Pre-Trade TCA | + SOC 2 Type II evidence pack |
| | + Counterparty Hub | + 4h SLA, 99.9% uptime |
| | + Natural Hedging | + White-glove onboarding |
| | + SWIFT / pain.001 | |
| 24h email support | 8h business support | 4h SLA |

**Footer:** *"Most treasuries our size pick Professional. Implementation: $0 / $12k / $24k–$60k."*

**Speaker notes:**
> "The most common path is Starter for 90 days as a proof, then Professional once your first audit cycle completes. No long-term contract for Starter."

---

## Slide 14 — Implementation

**Headline:** 90 days from kickoff to first live hedge.

**Timeline (5 horizontal stages):**
- **Week 1–2:** Kickoff, tenant provisioning, SSO config
- **Week 3–4:** ERP connector setup, historical data import
- **Week 5–6:** Policy + RBAC configuration, user training
- **Week 7–8:** First sandbox hedge, dry run with auditor
- **Week 9–12:** First live hedge, first effectiveness test, first regulatory submission

**Footer:** *"Self-serve Starter: 1 week. Enterprise with custom integrations: ~120 days."*

**Speaker notes:**
> "Reval and Murex implementations are 6–12 months. Ours is 90 days because we don't customize the engine — we configure the policy."

---

## Slide 15 — Next step

**Headline:** Let's go deeper.

**Three options:**
1. **30-min technical deep-dive** with your risk officer + IT — [Calendly link]
2. **Send the security pack** to your procurement team today
3. **Sandbox tenant** for your team to try, free for 14 days

**Footer:** *"[Your Name] · [Email] · [Phone]"*

**Speaker notes:**
> "Pick whichever step makes sense. Most teams start with the technical deep-dive — your risk officer will have sharper questions than I can anticipate."

---

## Appendix slides (don't show, but have ready)

### A1 — Architecture diagram
FastAPI + SQLAlchemy async + PostgreSQL backend (Render); Next.js 15.5 + React 19 frontend (Vercel); Redis cache; per-tenant encryption.

### A2 — Engine module list
46 modules in `engine_v1/`, 14 orchestrator modules in `engine/`. Naming convention: pure functions, no I/O, fully unit-tested.

### A3 — RBAC matrix
9 roles × 41 permissions. Sample mapping for Treasurer / Risk Officer / Auditor / Controller.

### A4 — WORM table list
`audit_events`, `calculation_runs`, `policy_revisions`, `ledger_entries`. PostgreSQL-level NO UPDATE / NO DELETE.

### A5 — Hash chain proof
Worked example: 3 RunEnvelopes, hash chain validated, tampering detected.

### A6 — Customer references
[To be filled with first 3 design partners]

### A7 — Roadmap
Q1: SAML SSO GA · Q2: Self-host option · Q3: Additional banking integrations · Q4: AP/AR auto-detection from ERP

---

## Demo notes (for the live walkthrough portion, ~10 min)

Follow the script in `docs/internal/go-to-market-analysis.md` Appendix A. End on the Audit Lab hash chain — that's the slide that moves money.

**Critical:** Use the demo tenant, not prod. Make sure a clean state is loaded.
