# Press Kit

**Use:** When a journalist, analyst, conference organizer, podcaster, partner, or investor asks "can you send me your press kit?", this is what we send.

**Format:** Markdown source of truth here; converted to a public PDF + hosted on `ordrtreasuryfx.com/press` once domain is live.

**Last reviewed:** 2026-04-25

---

## At-a-glance

| Field | Value |
|---|---|
| Company name | ORDR TreasuryFX |
| Product | Institutional FX hedge calculation & governance platform |
| Founded | [Year] |
| Headquarters | [City, Country] |
| Funding stage | [Bootstrapped / Pre-seed / Seed — keep current] |
| Employees | [Range — e.g., "1-10"] |
| Website | ordrtreasuryfx.com |
| Sales | hello@ordrtreasuryfx.com |
| Press / analyst | press@ordrtreasuryfx.com |
| Security disclosure | security@ordrtreasuryfx.com |

---

## Boilerplate (use verbatim)

### Short (40 words)

> ORDR TreasuryFX is the institutional FX hedge calculation and governance platform built for treasury teams that need their hedge accounting to be defensible, explainable, and auditor-ready by default. Headquartered in [city]. ordrtreasuryfx.com

### Medium (90 words)

> ORDR TreasuryFX is an institutional FX hedge calculation and governance platform for corporate treasury teams. The platform combines a deterministic hedge calculation engine with a tamper-evident audit trail, native IFRS 9 / ASC 815 hedge accounting, and a four-eyes governance pipeline — turning a process that typically lives in spreadsheets into a defensible, auditor-ready system of record. Customers include corporate treasurers managing FX exposures across multiple legal entities and currencies. ORDR is headquartered in [city]. Learn more at ordrtreasuryfx.com.

### Long (180 words)

> ORDR TreasuryFX is the institutional FX hedge calculation and governance platform for corporate treasury teams that need their hedge accounting to be auditor-ready by default.
>
> Most treasury teams today run their hedge program in a combination of spreadsheets, ERP modules, and bank portals — a process that produces results but rarely produces evidence. ORDR replaces this with a deterministic hedge calculation engine, a tamper-evident audit trail using a SHA-256 hash chain, native IFRS 9 / ASC 815 hedge accounting, and a four-eyes maker/checker governance pipeline.
>
> The platform is deliberately architecture-frozen at v1: no machine learning, no auto-learning, no broker execution. Every output is traceable to its inputs and reproducible months later. This is what makes ORDR's audit pack acceptable to a Big 4 auditor without taking the customer's word for it.
>
> ORDR was founded in [year] by [founder name(s)] and is headquartered in [city]. The company serves treasury teams from mid-market manufacturers through global multinationals.
>
> ordrtreasuryfx.com

---

## Founder bio

### Short (40 words)

> [Founder Name] is the founder of ORDR TreasuryFX. Before ORDR, [previous role / domain expertise / relevant credential]. Based in [city]. Reach out at [founder@ordrtreasuryfx.com].

### Medium (120 words) — to be filled in by founder

> [Founder Name] founded ORDR TreasuryFX in [year] after [origin moment — what they saw that others didn't]. Their background combines [domain 1], [domain 2], and [domain 3], with previous roles at [company / institution] where they [specific achievement that demonstrates relevant authority].
>
> They started ORDR because [the conviction in one sentence — e.g., "treasury teams deserve the same operational rigor that trading desks have had for thirty years"]. ORDR's design choices — deterministic engine, tamper-evident audit trail, no ML — reflect this conviction directly.
>
> [Founder Name] is based in [city] and writes occasionally on [topic] at [URL or platform].

### Photography

- Square headshot, 1024×1024 minimum, neutral background, professional but not stiff
- Wide environmental portrait if available, 1920×1080
- Both must be hosted on the press page with download links
- Photographer credit included if required

---

## Product fact sheet

| Item | Detail |
|---|---|
| Product category | Treasury management software / FX hedge accounting |
| Customer profile | Corporate treasury teams, $50M – $5B+ FX hedged annually |
| Deployment | SaaS; customer-selected residency (EU Frankfurt or US us-east-1) |
| Pricing | Starter $24k / Professional $72k / Enterprise from $144k annually |
| Implementation | 90 days for Professional, 120 days for Enterprise |
| Modules | Position Desk, Cash Positions, Hedge Calculation, Hedge Effectiveness (IFRS 9 / ASC 815), Audit Lab (WORM + hash chain), 4-Eyes Pipeline, Reports Studio, Pre-Trade TCA, Counterparty Hub, Natural Hedging, Regulatory Submissions (EMIR / MiFID II / CFTC), SWIFT MT103 + ISO 20022 pain.001 |
| Integrations | QuickBooks Online, Xero, NetSuite, Sage Intacct, Microsoft Dynamics 365, ERP via SFTP/API, market data via TwelveData |
| Standards | IFRS 9, ASC 815, EMIR Refit, MiFID II, CFTC, SWIFT MT103, ISO 20022 pain.001.001.09 (CBPR+), OWASP ASVS Level 2 |
| Compliance posture | SOC 2 Type II in progress (Q3 2026 target), GDPR (DPA + SCCs Module Two + UK Addendum + Swiss FADP), CCPA / CPRA |

---

## Talking points (use as-is, don't paraphrase loosely)

### What is ORDR?

> ORDR TreasuryFX is an institutional FX hedge calculation and governance platform. It replaces the spreadsheets, ERP modules, and bank portals that most treasury teams use today with a single platform built specifically for FX hedging.

### Why does it exist?

> Treasury teams have been told for years that their hedge program is critical, but the tooling has lagged. Most teams operate from spreadsheets and bank portals, which produce results but don't produce defensible evidence. As audit, regulatory, and internal-control requirements have tightened, this gap has become a liability. ORDR closes it.

### Who is it for?

> ORDR is for corporate treasury teams hedging $50M to $5B+ of FX exposures annually. Typical customers have 2–10 person treasury teams reporting to a CFO or VP Finance, with one or more legal entities, multiple currency pairs, and an external auditor who already asks pointed questions about hedge accounting.

### What's different about it?

> Three things. First, the platform is deterministic — no machine learning, no black-box decisioning. Every output is reproducible from its inputs months later. Second, the audit trail is cryptographically tamper-evident — a SHA-256 hash chain per tenant means we can prove the audit log hasn't been altered. Third, it was built for the four-eyes governance model that real treasury operations use, not bolted on after the fact.

### Why "no ML"?

> Treasury operations need explainability. When an auditor asks "why was this hedge ratio 0.78 on March 14?", the right answer is "because here are the inputs, here are the parameters, here is the calculation, and here is the chain proof that none of this has changed since." That answer is hard to give from a model. So we don't use one. The decision is deliberate, and it's a feature, not a limitation.

### Why "no broker execution"?

> The same reason. Execution introduces a class of risks — order management, market impact, broker selection — that are well-handled by existing systems and that have nothing to do with the hedge accounting and governance problem we solve. Adding execution would dilute the platform. Customers execute through their bank portals or their existing OMS, and ORDR records the result.

### How big is the market?

> Treasury management software is roughly a $4.5B annual market growing at ~11%. The slice we serve — FX hedge accounting & governance — is approximately $1.2B of that, and it's growing faster because of regulatory pressure (EMIR Refit, IFRS 9 enforcement) and audit pressure (post-2008 + post-2023 banking scrutiny).

### Competition?

> The incumbents are large treasury management systems (Reval/ION, Kyriba, GTreasury) and FX-specific specialists like FXall (Refinitiv/LSEG) and Hedge Trackers/Chatham. We win against them because we're built specifically for the audit-defensibility and explainability problem, with a much faster implementation than any incumbent and a price point that mid-market teams can actually pay.

---

## Brand assets

### Logo

- Primary logo: PNG (transparent), SVG, EPS — 3 sizes (small/medium/large)
- Reverse / dark-mode logo: same formats
- Wordmark only (no icon): same formats
- Icon only: same formats

### Color palette

| Use | Hex | Notes |
|---|---|---|
| Primary | [#________] | Used for primary CTAs, headings |
| Accent | [#________] | Used sparingly for highlights |
| Background — light | [#________] | |
| Background — dark | [#________] | |
| Body text | [#________] | Designed for 4.5:1 contrast minimum |

(Values to be filled in once brand work is complete; current product uses the design tokens in `frontend/src/app/globals.css`.)

### Typography

| Use | Font | Notes |
|---|---|---|
| UI body | IBM Plex Sans | Loaded via Google Fonts |
| Data / mono | IBM Plex Mono | |
| Headings (marketing) | Manrope | |
| Code | JetBrains Mono | |

### Voice & tone

- **Direct, not breathless.** "ORDR replaces spreadsheets" — not "ORDR transforms the way treasurers reimagine their treasury journey."
- **Specific over abstract.** Numbers, names, and outcomes — not adjectives.
- **Confident, not arrogant.** "We do this; we don't do that" — not "We are the leading provider of next-generation solutions."
- **British/American English neutral.** Default to American spelling; British is fine in customer-facing UK content.
- **No exclamation points outside actual exclamations.** No "!".
- **No emojis** in product, sales, or legal content. Reserve for community and casual social only.

---

## Press inquiries — what we respond to

| Type | Response time |
|---|---|
| Tier 1 outlet (FT, WSJ, Bloomberg, Reuters) on a treasury / FX / regtech story | Same business day |
| Trade publication (Treasury & Risk, FX Week, EuroFinance, AFP) | 1 business day |
| Analyst (Gartner, Forrester, Aite-Novarica) | 2 business days |
| Industry conference speaking inquiry | 3 business days |
| Podcast (verified, audience >1k) | 5 business days |
| Cold inbound that doesn't fit above | 5 business days, may decline politely |

We **don't** respond to:

- Off-topic SEO solicitations
- "Article opportunity for $X" — we do not pay for editorial coverage
- AI-generated outreach that mistakes our category

---

## Embargoes & disclosures

- We will respect a journalist's embargo when explicitly agreed in writing
- We disclose all material conflicts (e.g., sponsorship of a podcast we appear on)
- We do not pay for testimonials or reference quotes
- We disclose customer relationships when discussing customers in interviews ("a customer of ours"), even when the customer's name is anonymized

---

## What we will and won't comment on

**Will:**
- Our product, roadmap (current quarter only), positioning
- The treasury/FX market broadly
- Industry trends (hedge accounting, regulatory reporting, governance)
- Our hiring / fundraising once announced

**Won't (until appropriate time):**
- Specific customer names without their explicit pre-approval
- Specific competitive comparisons by name (we lean on positioning instead)
- Internal financial metrics we haven't already disclosed
- Future fundraising plans
- Personnel matters

---

## Press kit version log

- v1.0 — 2026-04-25 — initial draft

When the press kit is updated, increment the version and note the change at the top.
