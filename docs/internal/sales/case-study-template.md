# Case Study Template

**Use:** Once a customer is willing to be a public reference, this template generates the artifact. Aim for 1 page (web) + a 2-page PDF for procurement reading.

**Length:** ~600 words for web; ~1,200 for PDF.

**Tone:** Specific, factual, quote-rich. No generic SaaS language. The reader should be able to recognize a customer like themselves.

---

## Pre-flight: customer reference policy

Before drafting any case study:

1. **Written approval** from the customer's marketing or comms function — not just the buyer
2. **Quote approval** by the named individual being quoted — they sign off on the exact words
3. **Logo usage** approved separately — sometimes marketing approves the case study but not the logo
4. **Sensitive data review** — no specific dollar amounts that exceed what the customer's public filings disclose; no specific bank names or counterparties without permission
5. **Right to revoke** — customer can request the case study be taken down at any time; commitment to do so within 5 business days

This is in MSA Section 15 (right to use customer's name / case study / logo) — and we always follow up the contract clause with explicit case-by-case consent.

---

## Template

### Title

**[Customer Name] [verb-phrased outcome] with ORDR TreasuryFX**

Examples:
- "Acme Manufacturing cuts month-end close from 9 days to 3 with ORDR TreasuryFX"
- "Northbeam SaaS replaces 4-spreadsheet hedge process with ORDR TreasuryFX"
- "Meridian Industries reduces audit fees by 22% after deploying ORDR TreasuryFX"

Title rule: it must contain a *quantified* or *concrete* outcome. "Improves treasury process" is not a title.

### Customer at a glance (sidebar / box)

| Field | Value |
|---|---|
| Industry | [from customer's website] |
| Size | [revenue band, employee band — public-disclosure-safe] |
| Treasury function | [team size + scope] |
| Hedging program | [annual notional band, currencies, instruments] |
| Stack before ORDR | [Excel / [TMS name] / [ERP] / etc.] |
| Time to first live hedge | [N days] |
| Live since | [Month, Year] |

### The challenge (1 short paragraph + 1 quote)

State what was specifically broken. Avoid generic problems. Use a real quote from the named contact.

> *"[Direct quote — 1-2 sentences. Should be specific enough that a peer reading it recognizes their own situation.]"*
> — [Name], [Title], [Customer Name]

Example:
> *"We were running 14 different Excel files for our hedge program, and every quarter our auditor would ask the same three questions, and every quarter we'd spend 4 days reconstructing the answer. We knew there had to be a better way."*
> — Sarah Lin, Treasurer, Acme Manufacturing

### Why ORDR (3-5 bullets)

What specifically made the customer choose ORDR. Concrete, not generic.

- **[Reason 1]** — [one short sentence supporting it]
- **[Reason 2]** — [one short sentence supporting it]
- **[Reason 3]** — [one short sentence supporting it]

Example:
- **Audit-defensible by design** — "The hash chain meant our auditor could verify our hedge accounting without taking our word for it."
- **Specific to FX hedging** — "Other tools we evaluated were either generic treasury workstations or generic accounting tools. ORDR was built for what we actually do."
- **No ML, no black box** — "Our risk committee was specifically concerned about explainability. ORDR's deterministic engine meant every output could be traced back to its inputs."

### The implementation (1 paragraph)

A specific, factual paragraph about how the deployment went. Mention:

- Time from contract to first live hedge
- Who was on the implementation team (Customer side and ORDR side)
- One specific challenge that came up and how it was resolved (this is what makes the case study credible — perfect implementations don't sound real)

Example:
> The deployment ran from [Month] to [Month]. Acme's treasury team — Sarah and analyst Mark Patel — worked with ORDR's implementation lead through a 90-day plan. The single hardest part was reconciling Acme's Excel-based hedge ratio against ORDR's deterministic calculation; a 0.3 percentage-point difference turned out to be an undocumented rounding convention in the original spreadsheet that nobody had documented in seven years. "Finding that gap actually built our trust in ORDR — the platform forced us to surface an assumption we didn't even know we were making," Lin said.

### The outcomes (3-5 measurable bullets)

This is the heart of the case study. Every bullet must be quantified or concrete.

- **[Outcome 1]** — [specific metric, with before/after]
- **[Outcome 2]** — [specific metric]
- **[Outcome 3]** — [specific metric]

Examples:
- **Month-end close: 9 days → 3 days** — Acme's hedge accounting close cycle dropped by two-thirds in the first quarter after go-live
- **Auditor questions resolved in <5 minutes** — previously a 4-day reconstruction job per quarter
- **Zero hedge-effectiveness re-tests required** — ORDR's audit pack was accepted by the auditor on first review for the first three quarters
- **Treasurer time freed: ~12 hours per month** — reallocated to working-capital optimization

If a customer can't or won't quantify, the case study isn't ready. Wait until they can.

### Pull quote (large)

> *"[A second quote, different from the challenge quote. Should answer 'what would you tell a peer evaluating ORDR?']"*
> — [Name], [Title], [Customer Name]

Example:
> *"If you're running an FX hedge program in spreadsheets and your auditor flags it as a material risk, give ORDR an hour. We did, and we never went back to the spreadsheets."*
> — Sarah Lin, Treasurer, Acme Manufacturing

### About [Customer Name] (boilerplate, ~40 words)

Pulled from the customer's own website / 10-K / about page. Don't write your own version.

### About ORDR TreasuryFX (boilerplate, ~40 words)

> ORDR TreasuryFX is the institutional FX hedge calculation and governance platform built for treasury teams that need their hedge accounting to be defensible, explainable, and auditor-ready by default. Headquartered in [city]. Learn more at ordrtreasuryfx.com.

Keep this short. The case study is about the customer.

### Footer

- **Read more case studies:** ordrtreasuryfx.com/customers
- **Talk to us:** hello@ordrtreasuryfx.com

---

## Writing rules

1. **One named human per quote.** "An ORDR customer says…" is not a quote.
2. **Every quote is approved verbatim by the speaker.** No paraphrasing, no "lightly edited."
3. **Every metric is supplied by the customer or measurable from public data.** Don't invent.
4. **No embedded competitor name** unless the customer specifically named it and approved.
5. **No future-tense outcomes.** Only what's already happened.
6. **No "next phase" hype.** Case study is about *this* phase.
7. **Use customer's words for their problem.** Resist the urge to reframe.

---

## Distribution

Once approved:

- **Web page** at `/customers/[slug]` (1-page format)
- **PDF** for sales attachments (2-page format with one extra section: "Implementation timeline" Gantt-style sidebar)
- **Snippet** for the prospect deck (Slide 6: "What customers say")
- **Snippet** for outbound emails (one quote + one outcome)
- **LinkedIn post** by founder + customer's named individual (coordinated)

The case study is **not** distributed at:

- Industry conferences without customer's explicit pre-event approval
- Investor decks without re-confirming customer's consent
- Analyst briefings without re-confirming customer's consent

Reference fatigue is real. Don't burn your customers by over-using their case studies.

---

## Case-study lifecycle

| Stage | Trigger |
|---|---|
| **Draft** | Customer agrees to be a public reference |
| **In approval** | Sent to customer for quote + metric approval |
| **Approved** | Customer signs off in writing |
| **Live** | Published on web + sent to sales |
| **Refresh** | Annually, or after a major upgrade in the customer's ORDR usage |
| **Archive** | Customer churns, or asks for removal — taken down within 5 business days |

Customer-asked removal is honored without negotiation. Don't bargain. Take it down, send a thank-you note for their permission to use it while it lasted.

---

## First case study

The first case study is the hardest to get and the most valuable. Suggested approach:

1. Identify the design-partner customer with the strongest outcome by Day 90
2. Lead with the *non-public* version: a 1-pager that they share internally with their CFO and auditor (this is the carrot — it makes their decision look smart inside their own org)
3. After 6 months, approach for the public version with a specific ask
4. Make it easy: send a draft based on their internal version; they edit in 30 minutes
5. Trade the case study for a renewal-pricing concession, a multi-year extension, or a referral guarantee

The first case study unlocks the second through fifth. Spend the time.
