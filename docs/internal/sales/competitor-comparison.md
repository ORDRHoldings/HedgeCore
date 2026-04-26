# How ORDR Compares

**Audience:** Prospects who are evaluating multiple options
**Format:** Public-facing — designed to be honest enough that a competitor's salesperson can read it without finding factual errors

The shorter, internal version of this is `competitive-battlecards.md`. This document is what we publish on `ordrtreasuryfx.com/compare` and send to prospects mid-evaluation.

---

## How to read this page

This page is written from a single conviction: **a comparison page that won't admit anything is just marketing.** If a prospect can't trust us to fairly describe a competitor, they won't trust the rest of our claims either.

For each comparison, we say:
- **Where they're stronger** — first, in plain language
- **Where we're stronger** — second, with specifics
- **Who should pick whom** — by use case

If you find anything below that's factually wrong, please email **hello@ordrtreasuryfx.com** and we'll correct it.

---

## ORDR vs. Reval (ION)

### Where Reval is stronger

- Broader treasury management surface — cash management, debt, investments, intercompany — far beyond FX hedging
- Long enterprise track record; ION's installed base includes many of the world's largest treasuries
- Deep relationships with global banks and treasury operators
- Mature internationalization, multi-currency reporting beyond hedge accounting

### Where ORDR is stronger

- **Implementation timeline**: ORDR is 90 days to live. Reval projects routinely run 9–18 months
- **Total cost**: ORDR Professional is $72k annually all-in. Reval implementations are six- to seven-figure annual commitments
- **Audit-defensibility by design**: WORM hash chain is a first-class architectural commitment, not a feature
- **Determinism**: no machine learning, no auto-learning. Every output reproducible. This matters to risk committees and auditors
- **No execution layer to vet**: ORDR is purely calculation + governance + accounting; we don't ask procurement to vet a brokerage relationship

### Pick Reval if

You're a $10B+ treasury, you need a single platform spanning cash / debt / investments / FX, and you have the budget and timeline for a multi-quarter implementation.

### Pick ORDR if

You hedge between $50M and $5B of FX annually, your auditor flags hedge accounting as a material risk, and you want to be live in a quarter rather than a year.

---

## ORDR vs. Kyriba

### Where Kyriba is stronger

- Cloud-native treasury management with a broad surface area beyond FX
- Strong cash visibility and forecasting features
- Established mid-market presence with a wide partner ecosystem
- Many connectors to banks, ERPs, and ratings agencies

### Where ORDR is stronger

- **Specificity**: Kyriba's hedge accounting is one module among dozens. ORDR's entire surface is built around the hedge cycle
- **Audit pack quality**: ORDR's WORM + hash chain audit export is verifiable end-to-end without taking ORDR's word for it; this is a different posture from a typical TMS audit log
- **Pricing transparency**: ORDR publishes tier pricing. Kyriba's price is famously conditional on negotiation
- **Implementation pace**: ORDR's typical Professional-tier customer goes live in 90 days; Kyriba implementations more commonly run 6–12 months
- **No ML, no execution**: deliberate scope discipline that simplifies the security and audit conversation

### Pick Kyriba if

You're a multi-domain treasury team that needs cash forecasting + payments + investments + FX in one platform, and you're prepared for a longer implementation.

### Pick ORDR if

The FX hedge program is the part of treasury that's audit-anxious and process-broken, and you'd rather solve that one problem perfectly than buy a broader platform that solves it adequately.

---

## ORDR vs. FXall (Refinitiv / LSEG)

### Where FXall is stronger

- Deep liquidity — the platform is a multi-bank execution venue with decades of trading volume
- Pre-trade pricing transparency that comes from being a marketplace, not a calculator
- Bank-side relationships and post-trade workflow integrated with execution
- Used by trading desks; familiar to FX traders globally

### Where ORDR is stronger

- **We don't try to do execution**: FXall is a venue. We're a calculation + governance + accounting platform. Different jobs
- **Audit-defensibility for hedge accounting**: FXall isn't built for IFRS 9 / ASC 815 effectiveness testing or hedge designation memos
- **Treasury-team workflow**: ORDR is designed for the corporate treasurer's daily and quarterly cycle. FXall is designed for the trader's execution flow
- **Best execution evidence**: ORDR's pre-trade TCA produces auditable best-ex evidence in the form auditors actually want; FXall's evidence is trade-execution-centric

### Pick FXall if

You need trading liquidity and execution, and you're comfortable building hedge-accounting evidence elsewhere.

### Pick ORDR if

You need hedge accounting, governance, and auditor-ready evidence, and you'll continue to execute on FXall (or a bank portal) — ORDR records what FXall executed.

These are complementary, not competitive, in many enterprise stacks.

---

## ORDR vs. GTreasury

### Where GTreasury is stronger

- Broader treasury management offering — cash, debt, investments, FX
- Solid mid-market enterprise presence
- Established product with a wide feature surface

### Where ORDR is stronger

- **Hedge-program depth**: GTreasury covers FX hedging as one feature; ORDR's design center is the hedge cycle
- **Audit-pack format**: ORDR's evidence is hash-chain-verifiable. GTreasury's audit features are conventional logging
- **Modern stack**: ORDR is built on a modern web stack (Next.js / FastAPI) with current dev velocity; GTreasury's product carries more legacy
- **Pricing**: ORDR's tier pricing is published; GTreasury's is per-quote

### Pick GTreasury if

You want broad treasury management with FX as one of several supported areas.

### Pick ORDR if

The hedge program is your highest-anxiety, highest-audit-risk area and you want a tool built for that specifically.

---

## ORDR vs. Trovata

### Where Trovata is stronger

- Excellent cash visibility and forecasting — its core competency
- Bank API integrations are mature and broad
- AI-assisted cash forecasting is a real differentiator for some buyers
- Modern UX

### Where ORDR is stronger

- **Different problem domain**: Trovata is cash visibility + forecasting. ORDR is hedge calculation + governance + accounting. They overlap rarely
- **Hedge accounting**: Trovata doesn't focus on hedge designation, effectiveness testing, or audit-pack export
- **Determinism**: ORDR's deterministic engine is the antithesis of Trovata's AI-forecasting positioning. Some buyers want one, some want the other

### Pick Trovata if

Your top problem is cash visibility — knowing today and tomorrow's cash positions across multiple banks.

### Pick ORDR if

Your top problem is FX hedge accounting and audit defensibility.

These are largely complementary — many of our customers run Trovata or a similar cash-visibility tool alongside ORDR.

---

## ORDR vs. Hedge Trackers / Chatham Financial

### Where Hedge Trackers / Chatham is stronger

- Decades of hedge-accounting domain expertise — they're the de facto reference
- Hedge accounting *advisory*: their accountants will sit with yours and produce the memos
- Comfort for risk-averse audit committees: "we hired Chatham" is a recognized control
- Multi-asset class beyond FX (rates, commodities, etc.)

### Where ORDR is stronger

- **Software, not a service**: ORDR is a self-serve platform; Hedge Trackers / Chatham is consulting + tooling
- **Cost trajectory**: software cost stays flat as volumes scale; consulting cost scales with usage
- **Determinism and reproducibility**: ORDR is reproducible without a person in the loop. The advisory firms produce memos through skilled human work
- **Real-time decisions**: ORDR is in your treasurer's daily flow; advisory engagements are typically point-in-time

### Pick Hedge Trackers / Chatham if

You want an outside firm to own hedge accounting end-to-end, you have multi-asset hedging beyond FX, or your audit committee specifically wants the comfort of a named advisory firm.

### Pick ORDR if

You want to own the hedge process internally with a software platform that produces the artifacts your auditor wants, with consulting reserved for genuinely complex one-off questions.

These are not mutually exclusive — several of our customers have an advisory relationship with Chatham *and* run ORDR for the daily and quarterly process.

---

## What about Excel?

We have to address this honestly because Excel is the real-world incumbent for most teams under $1B FX volume.

### Where Excel is stronger

- Free, ubiquitous, zero implementation
- Maximally flexible — you can model anything
- Your team already knows it
- No vendor risk

### Where ORDR is stronger

- **Audit-defensibility**: Excel produces results, not evidence. An audit chain is something different
- **Reproducibility**: Excel files drift. Formulas get edited. Six months later "what did we do here?" is a research project. ORDR's envelopes are reproducible bit-for-bit
- **Governance**: Excel has no built-in maker/checker, no SoD enforcement, no policy linkage, no role-based access
- **Time cost**: ORDR's customers reclaim 10–20 treasurer-hours per month from Excel-based hedge work
- **Audit-fee impact**: most ORDR customers see audit-fee or audit-pain reduction within the first year

### Pick Excel if

You hedge under $50M, you don't have audit anxiety, you have unlimited treasurer time, and you've never had to reconstruct a hedge calculation from a year ago.

### Pick ORDR if

Any of those four don't describe you anymore.

---

## What we won't claim

- We won't claim to be the broadest treasury management platform — we deliberately aren't
- We won't claim to execute trades — that's by design out of scope
- We won't claim to use AI — we don't, and we believe that's a feature for our use case
- We won't claim to replace an experienced hedge-accounting advisor for genuinely novel transactions
- We won't claim multi-region active-active availability — we're single-region per customer

The "we don't" list is what makes the "we do" list credible.

---

## What to do next

- **If ORDR sounds like a fit**: book a 30-minute discovery call — we'll send a [questionnaire](discovery-questionnaire.md) so the call goes straight to what matters for you
- **If ORDR sounds wrong but you're not sure what's right**: ask us anyway. We've spent more time mapping this market than we have selling against it. We'll point you toward the right vendor honestly
- **If you've evaluated us and we lost**: we'd genuinely value 20 minutes for a [win/loss interview](win-loss-interview-template.md) — we learn more from losses than wins

Email **hello@ordrtreasuryfx.com**.
