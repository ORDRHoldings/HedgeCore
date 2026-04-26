# Investor Data Room Index

**Audience:** Founder + advisor preparing for fundraising; investor doing diligence
**Purpose:** Index of what lives in our data room, what's tier-gated, and how to navigate it efficiently

A clean data room signals operational maturity. A messy one signals the opposite. The goal is for a fund's analyst to do a thorough first pass in 4 hours.

---

## Data room structure

We use a tiered access model with three tiers. Investors progress through tiers as the conversation progresses.

```
TIER 1 — First meeting (no NDA)
  ├── Public website + product overview
  ├── Pitch deck (investor version)
  ├── Trust center (public docs)
  └── Press kit + founder bio

TIER 2 — Active diligence (mutual NDA)
  ├── Tier 1 contents +
  ├── Detailed financials (P&L, cash, runway)
  ├── Customer pipeline (anonymized)
  ├── Cohort metrics
  ├── Cap table
  ├── Org chart + key-person snapshot
  ├── Legal pack (templates only)
  └── Security: assurance evidence pack

TIER 3 — Term-sheet stage
  ├── Tier 2 contents +
  ├── Customer names + ARR per customer
  ├── Customer reference list
  ├── Detailed forecasts (3-year)
  ├── Hiring plan
  ├── All material contracts
  ├── Pen-test summary
  └── Source code escrow agent (read-only)
```

---

## Folder layout

The data room is hosted in a virtual data room provider (e.g., DocSend, Notion shared workspace, Google Drive with strict permissions). Folder structure:

```
ORDR TreasuryFX — Investor Data Room
├── 00-Index-and-Welcome.pdf
├── 01-Company-Overview/
│   ├── Pitch-Deck-Investor.pdf
│   ├── One-Pager.pdf
│   ├── Press-Kit.pdf
│   └── Founder-Bio-and-References.pdf
├── 02-Product/
│   ├── Product-Overview.pdf
│   ├── Reference-Architecture.pdf
│   ├── Engine-Truth-Table.pdf
│   ├── Product-Roadmap.pdf
│   └── Demo-Video-or-Recording.mp4
├── 03-Market/
│   ├── Market-Sizing-and-Wedge.pdf
│   ├── Competitive-Comparison.pdf
│   ├── Buyer-Persona-Analysis.pdf
│   └── Industry-Reports-and-References/
├── 04-Traction/
│   ├── Pipeline-Snapshot-Anonymized.pdf
│   ├── Cohort-Metrics.xlsx (or .pdf)
│   ├── Customer-References-Tier3.pdf
│   ├── ARR-Build-by-Customer-Tier3.pdf
│   └── Win-Loss-Themes.pdf
├── 05-Financials/
│   ├── P&L-Last-12-Months.xlsx
│   ├── Cash-Flow-and-Runway.xlsx
│   ├── 3-Year-Forecast-Tier3.xlsx
│   ├── Unit-Economics.pdf
│   └── Pricing-and-ACV-Distribution.pdf
├── 06-Team-and-Org/
│   ├── Org-Chart.pdf
│   ├── Founder-CV.pdf
│   ├── Key-Hires-Made.pdf
│   ├── Hiring-Plan-Tier3.pdf
│   └── Advisory-Board.pdf
├── 07-Legal-and-Cap-Table/
│   ├── Articles-of-Incorporation.pdf
│   ├── Cap-Table-Tier2.xlsx
│   ├── Stock-Plan.pdf
│   ├── Prior-Financings.pdf
│   ├── Material-Contracts-Tier3/
│   ├── IP-Assignment-Confirmations.pdf
│   └── Trademark-Filings.pdf
├── 08-Customer-Contracts/
│   ├── MSA-Template.pdf
│   ├── DPA-Template.pdf
│   ├── Order-Form-Template.pdf
│   ├── AUP.pdf
│   └── Executed-Contracts-Tier3/
├── 09-Security-and-Compliance/
│   ├── Trust-Center-Snapshot.pdf
│   ├── SOC2-Readiness-Attestation.pdf
│   ├── Pen-Test-Summary-Tier3.pdf
│   ├── Sub-Processor-List.pdf
│   ├── Privacy-Notice.pdf
│   ├── Threat-Model-Summary.pdf
│   ├── Incident-Response-Plan.pdf
│   ├── Business-Continuity-Plan.pdf
│   └── Certificates-of-Insurance.pdf
├── 10-Operations/
│   ├── Customer-Onboarding-Playbook.pdf
│   ├── Customer-Health-Scoring-Rubric.pdf
│   ├── Sales-Runbook.pdf
│   ├── Incident-Response-Drill-Log.pdf
│   └── Operational-KPIs.pdf
└── 11-Q&A/
    ├── FAQ-from-Prior-Diligences.pdf
    └── Outstanding-Questions-Log.pdf
```

The `00-Index-and-Welcome.pdf` is the first thing an investor opens. It says: how to navigate, what's tier-gated, who to ask for what, how quickly we respond.

---

## Tier-gating logic

| Document type | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| Public marketing materials | ✓ | ✓ | ✓ |
| Press kit, founder bio | ✓ | ✓ | ✓ |
| Trust center (public docs) | ✓ | ✓ | ✓ |
| Investor deck | ✓ | ✓ | ✓ |
| Anonymized pipeline | — | ✓ | ✓ |
| Cohort metrics | — | ✓ | ✓ |
| Detailed financials (last 12) | — | ✓ | ✓ |
| Cap table | — | ✓ | ✓ |
| Org chart | — | ✓ | ✓ |
| Legal templates | — | ✓ | ✓ |
| Assurance pack (NDA) | — | ✓ | ✓ |
| Customer names | — | — | ✓ |
| Customer references | — | — | ✓ |
| 3-year forecast | — | — | ✓ |
| Hiring plan | — | — | ✓ |
| Executed contracts | — | — | ✓ |
| Pen-test executive summary | — | — | ✓ |

Source code is **never** in the data room. Source review for term-sheet-stage technical diligence is a supervised session, not a download.

---

## What investors actually look for (and where we put it)

### Founder fit
Bio + references + first-30-min meeting. Folder `01`.

### Product clarity
Reference architecture + engine truth table + demo recording + product roadmap. Folder `02`.

### Market believability
Market sizing + wedge + competitive comparison. Folder `03`.

### Traction credibility
Pipeline + cohort metrics + cohort retention. Folder `04`. **Tier 3 only**: ARR by customer, named references.

### Capital efficiency
Burn vs. growth ratio + ACV distribution + pricing power. Folders `04` and `05`.

### Team scalability
Org chart + key hires made + hiring plan. Folder `06`.

### Legal cleanliness
Cap table + IP assignment + material-contract review. Folder `07`.

### Operational maturity
Trust center + assurance pack + onboarding playbook + incident response + BC/DR. Folders `09` and `10`.

### Risk
Win-loss themes + customer health + churn analysis + open security gaps. Folders `04`, `09`, `10`.

---

## Diligence FAQ — front-load this in `11-Q&A`

The questions every investor asks. Answering them in the data room saves three rounds of email.

### "What's your moat?"

Three compounding things:
1. The **WORM hash chain** is a switching cost — once a customer's quarterly audit packs are in our format, switching means re-tooling their entire audit-evidence relationship
2. The **deterministic engine** is a positioning moat — competitors with ML in their stack can't credibly claim what we claim about reproducibility
3. The **regulatory plumbing** (EMIR / MiFID / ISO 20022) is a build moat — each integration takes quarters and is the kind of work no one starts speculatively

See: `02-Product/Reference-Architecture.pdf`, `03-Market/Competitive-Comparison.pdf`.

### "Why no AI?"

Treasury operations need explainability. ML-based hedge decisioning fails the auditor's "show me how you arrived at 0.78" test. The decision to keep ML out is deliberate scope discipline, not a capability gap. We document this in our security overview and our investor deck.

See: `02-Product/Product-Overview.pdf`, `09-Security-and-Compliance/Trust-Center-Snapshot.pdf`.

### "How big can this get?"

The serviceable available market for FX hedge accounting & governance software is ~$1.2B annually growing at ~11%. Our wedge is the explainability + audit-defensibility positioning, which is sharpest in the $50M–$5B annual FX hedger segment. That segment is several thousand global companies. We've estimated TAM at $300M+ for our specific positioning.

See: `03-Market/Market-Sizing-and-Wedge.pdf`.

### "Who's the buyer? Who decides?"

Treasurer + Controller propose. CFO approves. CISO + Internal Audit have effective veto. Procurement closes. Sales motion accommodates this — see `10-Operations/Sales-Runbook.pdf` and the `09-Security-and-Compliance/` folder for what we put in front of CISO/Audit.

### "What about Reval / Kyriba / FXall?"

Public competitive page: `03-Market/Competitive-Comparison.pdf`. Internal battle cards on request under NDA.

### "What goes wrong?"

Top three risks (current as of [YYYY-MM]):
1. **SOC 2 Type II not delivered fast enough** — blocks enterprise procurement. Mitigation: contingency clause + readiness attestation + Q3 2026 target.
2. **Founder key-person risk** — addressed in `09-Security-and-Compliance/Business-Continuity-Plan.pdf` and the BC envelope.
3. **Single-cloud-provider dependency** — accepted risk for v1; documented in BC plan.

We update this list quarterly in `04-Traction/Win-Loss-Themes.pdf` and `09-Security-and-Compliance/`.

### "What's the use of funds?"

Tier 3 conversation. Outline:
- ~50% engineering — fund the operational evidence-collection for SOC 2 Type II, build the v2 modules customers are asking for, hire 2 senior engineers
- ~25% GTM — first dedicated revenue lead, content + outbound machine
- ~15% customer success — first dedicated CSM as customer count grows
- ~10% operations — security audit, pen test, insurance scaling, legal counsel

Specific allocation depends on round size; full plan in `06-Team-and-Org/Hiring-Plan-Tier3.pdf`.

### "What would make us pass?"

Honest answer:
- If you require >$5M ARR and 100+ customers at this stage, we're not there
- If you require an AI angle, we don't have one and won't add one
- If you require a specific industry (e.g., crypto, retail trading), we're not there
- If you require a US-only customer base, our market is global

Conversely, if you specifically value: deep regulatory plumbing, deterministic systems, compliance-driven SaaS, B2B with measurable audit-evidence outcomes, founder-led GTM in a niche we know cold — that's our shape.

---

## Maintaining the data room

| Cadence | Action |
|---|---|
| Monthly | Refresh financials, cohort metrics, pipeline |
| Quarterly | Refresh trust center, security artifacts, customer health, win-loss themes |
| On material event | Refresh pen-test summary, insurance certificates, board changes, key hires |
| On every fundraise round | Reset access tiers; archive old materials; restructure as needed |

Stale data rooms suggest stale operations. Treat the data room like product — it ships.

---

## Access controls

- All data-room access is via individually issued credentials (no shared logins)
- All access is logged with timestamps
- Tier upgrades require founder approval
- Mutual NDAs in place before Tier 2 access
- Term-sheet conversation opens Tier 3 access — never before

When a process ends (passed, term-sheet, or signed), revoke access on a timetable:

- **Pass**: 14 days
- **Stalled**: 30 days
- **Term-sheet not signed**: 7 days
- **Signed**: convert to standing access for the lead investor; others revoked at 14 days

---

## After the round

- Lead investor gets continued access to a "post-close" room with quarterly board materials
- Other participating investors get standing access to a more limited "investor update" room
- Non-participating investors who passed get a polite update once a year and may be re-engaged for the next round

The data room becomes a permanent operating function, not a one-off fundraising artifact. Build it that way.
