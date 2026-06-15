# ORDR TreasuryFX — Commercial Readiness & Go-To-Market Analysis

**Date:** 2026-04-25
**Status:** v1 architecture-frozen, feature-complete; 3 credential-blocked items remain
**Prepared for:** Founder / commercial lead — sale & market launch preparation

---

## 1. Executive Positioning

**One-line pitch:**
> ORDR TreasuryFX is the audit-grade FX hedging platform for corporate treasuries that must prove every hedge decision to a regulator — not just execute it.

**Three-line pitch:**
> Mid-market and enterprise treasuries spend €40k–€400k/year on Kyriba, Reval, or FXall, then bolt on Excel for hedge effectiveness, governance, and audit. ORDR replaces that bolt-on stack with a single deterministic engine: IFRS 9 / ASC 815 effectiveness testing, 4-eyes governance, WORM-audited hash chain, and EMIR/MiFID II reporting — out of the box. Every calculation is reproducible, signed, and admissible.

**Differentiators (the moat):**
1. **Tamper-evident audit chain** — SHA-256 WORM ledger, per-tenant, replayable. No competitor in the mid-market segment has this.
2. **Deterministic engine** — same inputs → same outputs, byte-for-byte. No ML, no auto-learning, no opaque optimization. Auditors can re-run.
3. **Tri-state pipeline (SANDBOX → STAGING → LEDGER)** — separation of analysis from production with maker/checker SoD enforced.
4. **Compliance-as-code** — IFRS 9 thresholds, R1–R8 risk taxonomy, hedge designation, and effectiveness testing baked into the kernel, not a spreadsheet.

---

## 2. Product Surface Area (what the buyer gets)

### 2.1 Capability clusters

| Cluster | What it includes | Buyer this lights up |
|---|---|---|
| **Exposure & Position** | Cash positions, AR/AP exposures, multi-entity netting, position desk, portfolio risk | Treasurer |
| **Hedge Calculation Engine** | 46-module deterministic kernel (engine_v1/), R1–R8 risk taxonomy, strategy-instrument mapping, scenario engine | Risk Officer |
| **Pre-Trade** | Pre-trade TCA, counterparty scoring, instrument selector, margin allocator | Trader / Treasurer |
| **Execution** | Position lifecycle (NEW → POLICY_ASSIGNED → READY_TO_EXECUTE → HEDGED), settlement, trade history | Operations |
| **Governance** | Tri-state pipeline, 4-eyes maker/checker, RBAC (9 roles, 41 permissions), policy revisions (WORM) | CFO / Compliance |
| **Hedge Accounting** | IFRS 9 effectiveness testing, ASC 815 designation, hedge ratios, retrospective + prospective tests | Controller / Auditor |
| **Regulatory Reporting** | EMIR, MiFID II, CFTC reporting (UTI-stamped XML), SWIFT MT103, ISO 20022 pain.001.001.09 CBPR+ | Compliance / Back office |
| **Audit & Forensics** | Audit Lab, hash-chain verification, audit trail explorer, markup-by-month, immutable event log | Internal Audit / External Auditor |
| **Natural Hedging** | Cross-entity netting, intercompany offsets, natural hedge identification | Treasurer |
| **Market Intelligence** | News signals, FX rates, debt portfolio, IR risk | Treasurer / CFO |
| **Connectors** | QuickBooks, Xero, NetSuite, Sage Intacct, Dynamics 365 (paper mode + live mode behind ENV) | IT / Integrations |
| **Reporting** | Custom report studio, narrative generation, scheduled exports | All personas |

### 2.2 Numbers buyers care about
- **~332 API endpoints** across 75+ route modules
- **65+ frontend pages** (Next.js 15.5 + React 19, App Router)
- **46 production engine modules** (deterministic kernel)
- **~4,800 backend tests** passing, ~75% coverage
- **5 ERP/accounting providers** wired (OAuth flows complete)
- **9 RBAC roles**, **41 permissions**, hierarchy_level 0–15
- **WORM tables**: audit_events, calculation_runs, policy_revisions, ledger_entries
- **JWT 30min/7d**, bcrypt passwords, CSRF double-submit, 60 req/min rate limit
- **SOC 2 controls matrix** drafted, **GDPR DPA** drafted, **OWASP ZAP** baseline scan clean

---

## 3. Competitive Positioning

| Competitor | Who they sell to | Strengths | Weakness ORDR exploits |
|---|---|---|---|
| **Kyriba** | Enterprise (>$1B revenue) | Full TMS, banking connectivity | Heavyweight, $200k+ ACV, weak hedge accounting depth, no immutable audit chain |
| **Reval (ION)** | Enterprise treasury & risk | Deep risk analytics, ASC 815 / IFRS 9 | Implementation 6–12 months, $300k+ ACV, dated UI, no SoD pipeline |
| **FXall (Refinitiv/LSEG)** | Mid-to-enterprise | Best-in-class FX execution venue | Execution-only, no governance / hedge accounting / audit story |
| **Openlink / Murex / Finastra** | Tier 1 banks, large corporates | Front-to-back office | $1M+ implementations, enterprise-only |
| **Hedge Trackers / Chatham** | Mid-market hedge accounting | Specialized accounting, advisory | Service-led not product-led, manual, expensive per-deal |
| **GTreasury / Trovata** | Mid-market cash mgmt | Modern UX, cash forecasting | Light on hedge accounting + governance |

**ORDR's wedge:** *"Reval-grade hedge accounting + Chatham-grade audit defensibility, at GTreasury-grade implementation speed and price."*

**Target ACV band (initial inference):** **$48k – $180k/year** depending on tier. Anchor pricing assumption:
- **Starter** (single entity, ≤500 trades/yr, paper-mode connectors): $24k/yr
- **Professional** (multi-entity, live ERP, EMIR reporting, TCA, Counterparty, Natural Hedging): $72k/yr
- **Enterprise** (white-glove onboarding, custom SSO, dedicated tenant DB, SOC 2 Type II evidence pack): $144k+/yr

The codebase already has **Professional-tier gating** wired on Counterparty Hub, Natural Hedging, TCA, and Regulatory Submissions — so tier discrimination is shippable today.

---

## 4. Target Customer Profile

### 4.1 Firmographic
- **Revenue band:** $50M – $2B (mid-market sweet spot)
- **Geography:** EU (EMIR-driven urgency), UK (post-Brexit reporting), US (ASC 815-driven), DACH (governance-heavy)
- **FX exposure:** $20M – $500M/yr notional hedged
- **Sectors:** Manufacturing, software (SaaS with multi-currency MRR), e-commerce, pharma, professional services with cross-border consulting

### 4.2 Stakeholder map (the buying committee)

| Role | What they care about | Which ORDR feature wins them |
|---|---|---|
| **CFO** | Risk transparency, audit defense, board reporting | Audit Lab, hash-chain, WORM ledger |
| **Treasurer** | Daily ops efficiency, exposure visibility, hedge execution | Position Desk, Pre-Trade TCA, Counterparty Hub |
| **Risk Officer** | Engine determinism, scenario coverage, R1–R8 taxonomy | Engine v1 kernel, scenario engine, portfolio risk |
| **Controller** | IFRS 9 / ASC 815 hedge accounting, journal entries | Hedge Effectiveness, GL Postings, ERP connectors |
| **Internal Audit** | Reproducibility, segregation of duties | 4-eyes pipeline, Audit Trail, hash-chain verifier |
| **External Auditor (Big 4)** | Evidence package, calculation trace | Audit Lab export, signed RunEnvelope, policy revisions |
| **Compliance** | EMIR / MiFID II / CFTC submissions | Regulatory Submissions module |
| **IT / SecOps** | SOC 2, GDPR, SSO, secret management | OWASP ZAP report, RBAC matrix, connector encryption |

### 4.3 Buying triggers
1. Failed audit finding on hedge designation or effectiveness testing
2. EMIR/MiFID reporting penalty or warning letter
3. Treasury team adding headcount → automation ROI case
4. M&A integration → multi-entity netting becomes urgent
5. New banking relationship → counterparty scoring + TCA needed

---

## 5. Sales Readiness Gap Analysis

### 5.1 ✅ Ready today
- **Product completeness** — all P0/P1 competitive items shipped 2026-04-18
- **Architecture freeze documented** — ADR-driven change control
- **WORM + hash chain operational** — verifier cron live
- **OWASP ZAP baseline clean**
- **GDPR DPA + SOC 2 controls matrix drafted**
- **4,800+ passing tests, 75% coverage**
- **Frontend warning baseline 0** (lint debt drained)
- **Live deploy URLs:** hedgecore.onrender.com (api), ordr-treasury.vercel.app (app)

### 5.2 ⚠️ Blocked on internal action
| # | Item | Blocker | Effort |
|---|---|---|---|
| 19 | Secret rotation (JWT, TwelveData, DB) | Run `docs/ops/secret-rotation-checklist.md` + scrub git history + force-push | 4h |
| 20 | IBKR live FX rate connector | TWS paper session + API enable | 2h |
| 24 | Close risk #2 once IBKR live | Auto-closes with #20 | — |
| — | Phase 4 production checklist | Verification sweep (Sentry DSN, dashboards, backup cadence) | 1 day |
| — | Origin push (~50 commits ahead) | Decision: rebase + force-push or merge | 30 min |

### 5.3 ❌ Needed before first commercial close

#### Technical
- **SOC 2 Type II audit** — controls matrix exists; need 6-month observation period + auditor engagement (~$25k–$60k)
- **Penetration test** — independent third-party, ZAP baseline is not enough for enterprise procurement
- **Status page** — `status.ordrtreasuryfx.com` (Statuspage.io / Atlassian / Better Uptime, ~$30/mo)
- **Demo environment** — sanitized tenant with synthetic data, never resets, with a "demo" login (currently `demo/demo` works on prod which is a sales liability — separate it)
- **Customer success runbook** — onboarding playbook (90-day to live)
- **Disaster recovery test** — documented RTO/RPO, evidence of a successful restore

#### Commercial
- **Public pricing page or pricing one-pager** — even hidden behind "Contact sales" anchors negotiations
- **MSA + Order Form templates** — DPA exists, MSA does not (use Common Paper or Bonterms)
- **Security questionnaire response library** — pre-filled SIG, CAIQ, VSAQ answers
- **Reference architecture diagram** — for IT due diligence (one-page PDF)
- **ROI calculator** — Excel/web tool: hours saved on hedge accounting × $X/hr + audit fee reduction
- **Case study or design partner** — pick 1–3 friendly customers, ship at $0 or $12k/yr in exchange for logo + quote
- **Marketing site** — currently the app IS the marketing site. Need landing page, security page, blog, pricing.

#### Legal / Compliance
- **Trademark check** for "ORDR TreasuryFX"
- **Vendor registry** is drafted — needs review + sign-off
- **Cyber insurance** — $1M minimum for enterprise procurement gates
- **Contractor-to-employee compliance** if not already handled
- **Export control** — confirm no ITAR/EAR exposure (FX software typically exempt but document it)

---

## 6. Pricing & Packaging Recommendation

### Tier table (recommended)

| | **Starter** | **Professional** | **Enterprise** |
|---|---|---|---|
| Annual price | $24,000 | $72,000 | $144,000+ |
| Legal entities | 1 | up to 5 | unlimited |
| Trades / yr | 500 | 5,000 | unlimited |
| Users | 5 | 25 | unlimited |
| Hedge accounting (IFRS 9 / ASC 815) | ✓ | ✓ | ✓ |
| Audit Lab + hash chain | ✓ | ✓ | ✓ |
| 4-eyes governance | ✓ | ✓ | ✓ |
| ERP connectors (live) | — | ✓ | ✓ |
| EMIR / MiFID / CFTC reporting | — | ✓ | ✓ |
| Pre-Trade TCA | — | ✓ | ✓ |
| Counterparty Hub | — | ✓ | ✓ |
| Natural Hedging | — | ✓ | ✓ |
| SWIFT / pain.001 | — | ✓ | ✓ |
| Custom SSO (SAML/OIDC) | — | — | ✓ |
| Dedicated tenant DB | — | — | ✓ |
| SOC 2 Type II evidence pack | — | — | ✓ |
| White-glove onboarding | — | — | ✓ |
| Support SLA | 24h email | 8h business | 4h, 99.9% uptime |

**Land-and-expand motion:** start at Starter for proof-of-value (90 days), expand to Professional once first audit cycle completes.

### Implementation fee
- Starter: $0 (self-serve)
- Professional: $12,000 one-time
- Enterprise: $24,000 – $60,000 depending on integrations

---

## 7. Presentation Deck Outlines

### 7.1 Prospect Demo Deck (15 slides, ~30 min)

| # | Slide | Purpose / hook |
|---|---|---|
| 1 | **Cover** | "Audit-grade FX hedging. Engine + governance + reporting in one platform." Logo, tagline, contact. |
| 2 | **The pain** | "Your hedge accounting lives in Excel. Your audit defense is screenshots." 3 quotes from real treasurers. |
| 3 | **Cost of the status quo** | $X audit hours, $Y reporting penalties, $Z headcount on reconciliation. ROI tease. |
| 4 | **What ORDR is** | One-line + product screenshot of dashboard. |
| 5 | **The engine** | Deterministic kernel diagram. "Same inputs → same outputs. Forever." Auditor angle. |
| 6 | **Hedge accounting (IFRS 9 / ASC 815)** | Effectiveness chart screenshot. Designation flow. Journal entry export. |
| 7 | **Governance: tri-state + 4-eyes** | Pipeline diagram (SANDBOX → STAGING → LEDGER). Maker/checker UI screenshot. |
| 8 | **Audit: WORM + hash chain** | "Every calculation is signed. Every change is replayable." Auditor's wet dream. |
| 9 | **Pre-Trade: TCA + Counterparty Scoring** | TCA view screenshot. Counterparty heatmap. |
| 10 | **Regulatory: EMIR / MiFID / SWIFT** | XML output, UTI stamp, MT103 sample. |
| 11 | **Integrations** | ERP grid (QBO, Xero, NetSuite, Sage, Dynamics). Banking connectors (IBKR + planned). |
| 12 | **Security & compliance** | SOC 2, GDPR DPA, OWASP ZAP, encryption-at-rest, RBAC. |
| 13 | **Pricing** | Three-tier table. "Most pick Professional." |
| 14 | **Implementation** | 90-day plan: kick-off → data migration → first live hedge → first audit cycle. |
| 15 | **Next step** | "Book a 30-min technical deep-dive." Calendly link. |

### 7.2 Investor Pitch Deck (12 slides, ~20 min)

| # | Slide | Purpose / hook |
|---|---|---|
| 1 | **Cover** | Product, team, round size. |
| 2 | **The treasury software market** | $4.5B TMS market, $1.2B hedge-accounting subset, growing 11% CAGR. |
| 3 | **Why now** | EMIR Refit, post-FTX counterparty scrutiny, IFRS 9 enforcement uptick, AI-skeptical regulators. |
| 4 | **The wedge** | Deterministic + auditable. Why this beats AI-driven optimization in regulated workflows. |
| 5 | **Product** | One screenshot per cluster (engine, governance, audit, reporting). |
| 6 | **Traction** | Design partners, ARR, pipeline, NPS, retention. (Fill in numbers when available.) |
| 7 | **Business model** | Tiered SaaS, $48k–$180k ACV, 90% gross margin target. |
| 8 | **Go-to-market** | Outbound to CFOs/Treasurers + inbound via security/compliance content + Big 4 audit firm partnerships. |
| 9 | **Competition** | 2x2: rigor vs. accessibility. Reval/Murex top-right but unaffordable; Trovata/GTreasury accessible but light on rigor; ORDR is rigor + accessibility. |
| 10 | **Moat** | Compliance-as-code, deterministic engine (years of accumulated R1–R8 + IFRS 9 logic), WORM audit chain (data network effect: longer trail = stickier customer). |
| 11 | **Team** | Founders, advisors, hires planned. |
| 12 | **The ask** | $X for Y months → Z customers → $A ARR. Use of funds. |

### 7.3 Auditor / Procurement Deck (8 slides, ~15 min)

Aimed at Big 4 partners, internal audit, and IT procurement — the gatekeepers.

| # | Slide |
|---|---|
| 1 | Cover + scope |
| 2 | Architecture diagram (FastAPI + Postgres + Next.js, render + vercel) |
| 3 | Data flow: input → engine → WORM ledger → reports |
| 4 | Security controls (RBAC, JWT, CSRF, rate limit, OWASP ZAP) |
| 5 | Compliance posture (SOC 2 controls, GDPR DPA, vendor registry) |
| 6 | Audit evidence package walkthrough (Audit Lab export sample) |
| 7 | Hash-chain verification proof-of-concept |
| 8 | Q&A + reference contacts |

---

## 8. 30 / 60 / 90-Day Commercial Launch Plan

### Days 1–30: Sales-readiness
1. Rotate secrets, scrub git history, push origin (Day 1)
2. Phase 4 production checklist verification (Days 2–4)
3. Separate demo tenant from prod (Days 5–6)
4. Status page live (Day 7)
5. Engage SOC 2 Type II auditor (Day 7); engage pen-test firm (Day 7)
6. Marketing site MVP — landing + pricing + security pages (Days 8–14)
7. ROI calculator (Days 15–17)
8. Security questionnaire response library — SIG Lite (Days 18–22)
9. Reference architecture PDF (Day 23)
10. Prospect deck v1 + auditor deck v1 (Days 24–28)
11. First 10 outbound conversations booked (Days 29–30)

### Days 31–60: Design partners
1. Sign 2–3 design partners at $0–$12k/yr
2. Run them through 90-day onboarding playbook
3. Capture testimonials + screenshots
4. Investor deck v1 (if raising)
5. Begin SOC 2 Type II observation period
6. Pen-test report received → remediate

### Days 61–90: First paid close
1. Convert 1 design partner to paid Professional tier
2. Publish first case study
3. Hire: 1 GTM (founder-led until then)
4. Big 4 audit firm partnership conversation
5. SOC 2 Type II observation continuing

---

## 9. Risk Register for Commercial Launch

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| First customer fails audit using ORDR | Low | Catastrophic | Big 4 advisor on retainer, Audit Lab export reviewed by external auditor pre-go-live |
| Production incident during demo | Med | High | Status page + monitored uptime, separate demo tenant |
| Competitor (Kyriba/Trovata) ships hash-chain audit | Low | High | Patent the methodology, build data moat fast |
| Procurement gate on cyber insurance | High | Med | Buy $1M policy now (~$3k/yr) |
| EMIR / MiFID schema changes mid-cycle | Med | Med | Subscribe to ESMA bulletins, schema-version field already in submissions module |
| Founder bus factor | High | High | Document onboarding runbook, dual-key Render/Vercel access |
| Pricing too low (leaving money on table) | High | Med | Anchor high in first 5 deals, adjust |
| Pricing too high (no closes) | Med | High | Have a "design partner" tier ready ($0–$12k) |

---

## 10. Recommended Immediate Next Actions (this week)

1. **Decide audience priority** — prospects, investors, or partners — and lock the deck to one primary track first.
2. **Run secret rotation** — single highest-leverage technical action; unblocks live deploy story.
3. **Separate demo tenant from prod** — `demo/demo` on prod is a sales liability if a prospect finds it.
4. **Engage SOC 2 Type II auditor** — 6-month clock starts today; this is the long pole.
5. **Buy a domain + landing page** — even a Framer site with the prospect deck content takes 1 day.
6. **Pick 3 design-partner targets** — warm intros only, mid-market with active hedge programs.
7. **Set ACV anchor** — decide whether to lead with $24k Starter or skip straight to $72k Professional.

---

## Appendix A: Demo flow script (15-minute walk-through)

1. Login → dashboard (30s)
2. Position Desk → show open exposure across 3 entities (90s)
3. Pre-Trade TCA → run a hypothetical EUR/USD hedge (90s)
4. Counterparty Hub → score 4 banks for the trade (60s)
5. Submit proposal (maker) → switch user → approve (checker) → SoD enforced (2 min)
6. Hedge designation: IFRS 9 effectiveness test runs, threshold check passes (2 min)
7. Position lifecycle advances → HEDGED state → GL postings draft (90s)
8. Audit Lab → show RunEnvelope → verify hash chain (2 min)
9. Regulatory Submissions → generate EMIR XML with UTI stamp (90s)
10. Reports Studio → schedule a monthly hedge effectiveness PDF (60s)
11. Settings → RBAC matrix, tier upgrade CTA (60s)

End on the audit chain — that's the slide that moves money.

---

## Appendix B: Top objection handling

| Objection | Response |
|---|---|
| "We already have Kyriba" | "Great — most of our customers keep Kyriba for cash. We replace the hedge-accounting Excel layer that lives next to it." |
| "We're too small for this" | "Starter is $24k. Two days of audit fees. Pays for itself the first time you don't have to recreate hedge effectiveness in Excel." |
| "Why not Reval?" | "Reval is 12 months and $300k to implement. We're 90 days and $72k. And our audit chain is something they can't replicate without rewriting their core." |
| "How is this different from a spreadsheet?" | "Spreadsheets aren't deterministic, aren't WORM-audited, and don't generate EMIR XML. Auditors can't replay them." |
| "What about AI-driven hedging?" | "By design, no ML in the engine. Regulators are skeptical of opaque optimization in regulated workflows. Our customers can defend every decision." |
| "Can we self-host?" | "Enterprise tier supports dedicated tenant DB. Full self-host on roadmap (Q3 / next year). Currently SaaS only on EU + US regions." |
| "Implementation time?" | "90 days from contract to first live hedge. Self-serve Starter is 1 week." |

---

**End of analysis.**
