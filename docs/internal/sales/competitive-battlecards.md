# Competitive Battlecards

**Purpose:** One-pager per major competitor, structured identically so you can teach a new AE in two hours. Use during deal cycles when a prospect mentions a competitor by name.

**How to use:**
1. **Listen for the name.** When the prospect says "we're already evaluating [X]," shift into competitive mode.
2. **Don't trash the competitor.** Acknowledge their strengths first. Then pivot to where ORDR is structurally different.
3. **Anchor on one wedge per competitor.** The 5-bullet "Where we win" section is the trump card; pick the most relevant for the prospect's pain.
4. **Have receipts ready.** Each card lists the proof points. Don't make claims you can't back up.

---

## Card 1 — Reval (ION Treasury)

**Category:** Enterprise treasury & risk platform
**Best at:** Deep risk analytics, ASC 815 / IFRS 9 hedge accounting depth
**Typical customer:** Fortune 500 treasury, $1B+ revenue
**Typical ACV:** $200k – $500k
**Typical implementation:** 6–12 months

### Where they're strong (acknowledge it)

- Mature hedge accounting depth (decades of regulatory logic)
- Wide product surface (treasury management + cash + risk + IFRS)
- Big Tier 1 customer references
- Established Big 4 audit firm relationships

### Where they're weak

- Heavyweight, dated UI (mid-2010s ergonomics)
- Implementation timeline (6–12 months) is a deal-breaker for mid-market
- $300k+ entry point makes it inaccessible below $1B revenue
- Acquired by ION → product roadmap subordinated to corporate priorities
- No native immutable audit chain (audit trail is logs, not tamper-evident)
- 4-eyes governance is configurable, not enforced architecturally

### Where we win

1. **90 days vs. 9 months.** ORDR Professional is live in 90 days; Reval implementations average 9 months. *Receipts: ORDR onboarding playbook + customer ref (when available).*
2. **$72k vs. $300k.** Same hedge accounting depth at one-quarter the price for mid-market scope. *Receipts: ORDR pricing page + ROI calculator.*
3. **Tamper-evident audit chain.** Reval has logs. We have a SHA-256 hash chain verified daily, with cryptographic detection of post-trade alterations. *Receipts: Audit Lab demo.*
4. **Architectural SoD.** Maker/checker is enforced in code, not policy. Reval enforces via workflow config that admins can modify. *Receipts: code-level demo of `_check_separation_of_duties()`.*
5. **Modern engineering velocity.** Quarterly product updates by a focused team — not a corporate roadmap inherited from an acquisition.

### Common Reval objections to handle

| Objection | Response |
|---|---|
| "Reval is the gold standard for hedge accounting" | "Agreed for enterprise. The question is whether you need an enterprise-implementation timeline and price tag for a mid-market hedge program. We're built specifically for the size of your team." |
| "Reval has more features" | "True. Most of those features serve teams of 20+ in treasury. For your team size, our scoped feature set ships in 90 days. Reval will take 9 months and you'll only use a third of what you're paying for." |
| "We have a long-standing Reval relationship" | "Many of our customers do too — they just couldn't get a Reval ROI case to clear committee at $300k. We come in at $72k. Side-by-side, the math works." |

### When NOT to compete

- Customer is true Fortune 500 with 30+ entities and 20+ treasury staff → Reval is appropriate; don't waste cycles
- Customer's CFO has personal relationship with Reval / ION executive → too high a switching cost
- Customer specifically values the broader ION ecosystem (Wallstreet, Openlink) → integration story is harder to fight

---

## Card 2 — Kyriba

**Category:** Treasury management system (TMS) — cash + payments + (light) hedge
**Best at:** Cash management, bank connectivity, SWIFT, payments
**Typical customer:** Mid-to-large enterprise, $500M+ revenue
**Typical ACV:** $80k – $300k
**Typical implementation:** 4–8 months

### Where they're strong (acknowledge it)

- Best-in-class cash position visibility
- Massive bank connectivity (1,000+ banks)
- Strong SWIFT and payment workflows
- Modern UI relative to legacy TMS competitors
- Dominant brand in mid-market treasury

### Where they're weak

- Hedge accounting is a thin module, not core competence
- IFRS 9 / ASC 815 effectiveness testing typically still done in spreadsheets next to Kyriba
- No tamper-evident audit chain
- Governance pipeline is workflow config, not architectural
- Pricing scales aggressively with bank connections + entities

### Where we win

1. **We're complementary, not replacement.** "Keep Kyriba for cash. Use ORDR for hedge accounting and audit." This is the easiest dual-platform pitch. *Receipts: integration architecture diagram.*
2. **You probably do hedge accounting in Excel anyway.** Most Kyriba customers have a spreadsheet stack next to Kyriba. We replace that spreadsheet stack. *Receipts: pain quotes from prospect deck.*
3. **Audit defensibility.** Kyriba doesn't ship hash chains. *Receipts: Audit Lab demo.*
4. **Fixed pricing, no per-bank charges.** All our ERP and bank connectors are included. *Receipts: pricing page.*
5. **Treasurers are the user. Auditors are the closer.** Kyriba's auditor story is weak — it was built for cash ops, not for IFRS/ASC defense.

### Common Kyriba objections to handle

| Objection | Response |
|---|---|
| "We already pay Kyriba for treasury — why two platforms?" | "Most of our customers keep Kyriba. The question is what's running your hedge accounting today. If it's spreadsheets, that's the layer ORDR replaces. Kyriba isn't built for it." |
| "Kyriba just released a hedge accounting module" | "Yes, and it's a thin layer that doesn't have IFRS 9 effectiveness testing or hash-chain audit. Worth comparing — we'll show side by side." |
| "Adding ORDR means another integration" | "We integrate with Kyriba via standard APIs. Live in 1–2 weeks. The alternative — keeping spreadsheets — is the integration that already costs you 240 hrs/yr." |

### When NOT to compete

- Customer's primary pain is cash management, not hedge accounting → Kyriba is the right fit
- Customer has < $50M FX notional and no audit pressure → too small to justify a second platform

---

## Card 3 — FXall (Refinitiv / LSEG)

**Category:** FX execution venue + multi-bank platform
**Best at:** Multi-bank FX execution, RFQ workflows, dealer connectivity
**Typical customer:** Treasury teams already running an active FX program
**Typical ACV:** Variable; spreads + per-trade fees
**Typical implementation:** 2–4 weeks

### Where they're strong (acknowledge it)

- Best-in-class FX execution venue
- Direct dealer connectivity (most major FX banks)
- Mature RFQ workflows
- Brand recognition + Refinitiv data integration

### Where they're weak

- Execution-only — no governance, hedge accounting, audit, or reporting
- Doesn't replace what comes before (analysis, designation) or after (effectiveness, journal entries)
- No IFRS 9 / ASC 815 logic
- No EMIR / MiFID submission generation

### Where we win

1. **Different category entirely.** FXall executes; ORDR governs, calculates, and audits. They live side by side. *Receipts: integration overview.*
2. **Pre-trade TCA.** ORDR's TCA module gives you pre-trade cost estimates and best-ex evidence. FXall has it post-execution.
3. **Counterparty scoring.** ORDR scores banks daily; FXall connects you to them.
4. **Audit trail.** When the auditor asks "why did you choose this bank for this trade?", FXall shows execution. ORDR shows the decision logic with cryptographic proof.
5. **Regulatory submissions.** FXall doesn't generate UTI-stamped EMIR XML.

### Common FXall objections to handle

| Objection | Response |
|---|---|
| "We already use FXall — isn't ORDR redundant?" | "FXall is execution. ORDR is the layer above it (analysis, governance) and below it (audit, reporting). We're complementary, not redundant." |
| "Can we just use FXall reports?" | "FXall reports document execution. They don't document the decision rationale, the IFRS 9 designation, or the effectiveness test. Auditors want all three." |

### When NOT to compete

- Customer's immediate pain is execution venue selection → wrong fight; refer to FXall as a partner

---

## Card 4 — GTreasury

**Category:** Modern mid-market TMS
**Best at:** Cash forecasting, treasury workflows, modern UI
**Typical customer:** $200M – $2B revenue mid-market
**Typical ACV:** $40k – $120k
**Typical implementation:** 60–90 days

### Where they're strong (acknowledge it)

- Modern UI/UX (better than legacy TMS competitors)
- Solid cash forecasting and workflow tools
- Reasonable pricing for mid-market
- Reasonable implementation timeline

### Where they're weak

- Hedge accounting is light (effectiveness testing not deep)
- No native immutable audit chain
- 4-eyes governance is configurable, not architectural
- EMIR / MiFID reporting is partial
- Counterparty scoring not native

### Where we win

1. **Hedge accounting depth.** GTreasury covers cash and basic hedge tracking. ORDR covers IFRS 9 effectiveness, ASC 815 designation, and full hedge accounting lifecycle.
2. **Audit defensibility.** GTreasury's audit story is "we have logs." Ours is "we have a tamper-evident hash chain verified daily."
3. **Regulatory submissions.** ORDR generates EMIR UTI-stamped XML, MiFID best-ex evidence, SWIFT MT103 — out of the box. GTreasury covers some, not all.
4. **Counterparty Hub + TCA.** GTreasury doesn't have pre-trade TCA or daily counterparty scoring.
5. **Comparable price, deeper rigor.** Our Professional ($72k) is roughly the GTreasury price band, with materially deeper rigor.

### Common GTreasury objections to handle

| Objection | Response |
|---|---|
| "GTreasury covers our needs at the same price" | "Yes, until your auditor asks for IFRS 9 effectiveness or your CFO asks for hash-chain audit. Then there's a gap. The question is whether to deal with that gap with spreadsheets or with us." |
| "We like the GTreasury UI" | "Same generation of design language. Try ours — sandbox is free for 14 days. UI alone shouldn't be the deciding factor for hedge accounting." |

### When NOT to compete

- Customer's primary pain is cash forecasting → GTreasury is the right fit; consider partnership

---

## Card 5 — Trovata

**Category:** Modern cash management platform with API-first architecture
**Best at:** Cash visibility, multi-bank aggregation, modern API integration
**Typical customer:** $100M – $1B revenue, modern finance teams
**Typical ACV:** $30k – $100k
**Typical implementation:** 30–60 days

### Where they're strong (acknowledge it)

- Strong API and developer experience
- Modern UX, fast iteration
- Cash analytics and forecasting
- Reasonable mid-market pricing

### Where they're weak

- Light on hedge accounting (mostly cash-focused)
- No deep IFRS 9 / ASC 815 logic
- No tamper-evident audit chain
- No EMIR / MiFID reporting
- No 4-eyes pipeline architecture

### Where we win

1. **Different problem.** Trovata is cash visibility. ORDR is hedge governance and audit. Most prospects need both, in parallel.
2. **Hedge accounting fit.** If your prospect is doing hedge effectiveness in spreadsheets next to Trovata — that's the gap we close.
3. **Audit defensibility.** Trovata isn't built for IFRS 9 audit defense. We are.
4. **Regulatory reporting.** EMIR XML, MiFID, CFTC out of the box.

### Common Trovata objections to handle

| Objection | Response |
|---|---|
| "Trovata is modern; isn't that enough?" | "Modern cash. We're modern hedge accounting. Different functions, often used together." |
| "Trovata's API is great" | "Ours too — built on the same architectural philosophy. The difference is the IFRS/EMIR/audit layer on top." |

### When NOT to compete

- Customer's primary need is bank aggregation and cash forecasting → not our deal

---

## Card 6 — Hedge Trackers (Chatham Financial advisory model)

**Category:** Hedge accounting service + lightweight tooling
**Best at:** White-glove hedge accounting advisory, IFRS 9 / ASC 815 expertise
**Typical customer:** Mid-market with active hedge program, no in-house treasury depth
**Typical ACV:** $40k – $200k (heavily service-led)
**Typical implementation:** Variable (service-led)

### Where they're strong (acknowledge it)

- Deep hedge accounting expertise from accountants and consultants
- Strong Big 4 / audit firm relationships
- Trusted brand in the hedge advisory space
- Hands-on service delivery

### Where they're weak

- Service-led, not product-led — does not scale with customer growth
- Manual deliverables (spreadsheets, PDFs) rather than continuously-updated platform
- Per-deal or per-engagement pricing inflates as hedge program grows
- No real-time audit chain
- Limited self-service capability — customer always depends on Hedge Trackers staff
- Slow to adopt new regulatory schemas (e.g., EMIR Refit)

### Where we win

1. **Software economics, not service economics.** Predictable annual subscription, scales without per-deal costs. Hedge Trackers' costs balloon with hedge program growth.
2. **Real-time audit, not quarterly deliverables.** Our hash chain verifies continuously. Their PDFs document quarterly.
3. **Self-service.** Your treasury team can run effectiveness tests and produce documentation themselves. With Hedge Trackers, every report depends on their consultants.
4. **Faster regulatory updates.** EMIR Refit XML schema changed; we shipped updates in days. Service shops update on engagement basis.
5. **Audit chain provides what advisory cannot.** Hedge Trackers can vouch for the quality of their work. They cannot give you cryptographic proof that records have not been altered.

### Common Hedge Trackers objections to handle

| Objection | Response |
|---|---|
| "Hedge Trackers does the work for us" | "Right — and that's the trade-off. You're paying for hours, not capability. As your hedge program grows, hours grow proportionally. Our cost stays flat." |
| "We need Big 4-grade hedge accounting expertise" | "We have advisors with that depth on retainer for complex cases. The day-to-day work — designation, effectiveness, journal entries — runs on the platform without consultants." |

### When NOT to compete

- Customer is genuinely small and infrequent (5 hedges/yr, no plans to scale) → Hedge Trackers' service model fits
- Customer specifically values having a CPA team review every hedge → wrong fit for product

---

## Quick-reference matrix

| | Reval | Kyriba | FXall | GTreasury | Trovata | Hedge Trackers | **ORDR** |
|---|---|---|---|---|---|---|---|
| Hedge accounting depth (IFRS 9 / ASC 815) | ●●● | ● | — | ● | — | ●●● | **●●●** |
| Tamper-evident audit chain | — | — | — | — | — | — | **●●●** |
| 4-eyes architectural SoD | ● | ● | — | ● | — | — | **●●●** |
| Pre-trade TCA | ● | ● | ●● | — | — | — | **●●●** |
| Counterparty scoring | ● | ● | — | — | — | — | **●●●** |
| EMIR / MiFID UTI-stamped XML | ●● | ●● | — | ● | — | ● | **●●●** |
| Modern UX | ● | ●●● | ●● | ●●● | ●●● | ● | **●●●** |
| Implementation speed (mid-market) | — | ● | ●●● | ●●● | ●●● | — | **●●●** |
| Mid-market price fit | — | ● | n/a | ●●● | ●●● | ● | **●●●** |

`●●●` = strong · `●●` = adequate · `●` = light · `—` = absent

---

## Cross-card patterns (worth memorizing)

- Against **enterprise platforms** (Reval, Murex, Openlink): wedge is **price + speed**
- Against **TMS platforms** (Kyriba, GTreasury, Trovata): wedge is **hedge accounting depth + audit defensibility**
- Against **execution venues** (FXall, 360T): wedge is **governance + pre-trade**
- Against **service shops** (Hedge Trackers, Chatham): wedge is **product economics + real-time audit**

If a prospect names a competitor not on this list, default to:
1. Acknowledge their strength
2. Pivot to "what does your hedge accounting and audit story look like?"
3. Lead with the hash chain demo

---

## Notes on competitor sourcing

These cards are based on public competitive intelligence as of 2026-04-25 — pricing, ACV, and implementation timelines are sourced from G2 reviews, Capterra reviews, customer interviews, and public RFP documents. Update quarterly. When a competitor ships material new functionality (e.g., Kyriba ships hash-chain audit), update the relevant card and re-validate the wedge.
