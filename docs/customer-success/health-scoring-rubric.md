# Customer Health Scoring Rubric

**Audience:** Customer Success, founder, anyone tracking renewal risk
**Purpose:** A consistent, shared definition of "healthy" vs "at risk" so we don't notice churn one renewal cycle too late

The rubric runs **monthly per customer** during normal operations and **weekly** for any customer at Yellow or Red.

---

## Why we score

Customers don't churn unexpectedly — they signal it for months, and we miss the signals because we're busy. A scoring rubric forces a structured 5-minute review and a written status. The discipline is what surfaces the early warnings.

---

## The score

A single rolled-up color: **Green / Yellow / Red**. Not a 100-point number. The color is what gets reviewed; the components are what diagnose it.

| Color | Definition | Action |
|---|---|---|
| 🟢 **Green** | On track for renewal; expanding usage; engaged | Quarterly check-in, light touch |
| 🟡 **Yellow** | One or more meaningful signals of risk; renewal not certain | Weekly attention; founder aware; intervention plan |
| 🔴 **Red** | Multiple signals; active disengagement or stated dissatisfaction | Founder leads; renewal-save play activated |

A customer can move from Green → Red in a single month if the right trigger fires. Don't insist on gradualism.

---

## Six dimensions

Each customer is scored on six dimensions monthly. The rolled-up color is determined by the **worst** dimension, not the average — one Red dimension turns the customer Red overall.

### 1. Usage

| Indicator | Green | Yellow | Red |
|---|---|---|---|
| Logins per active user per week | 3+ | 1–2 | <1 |
| Hedges run through ledger per quarter | At or above contracted volume | Below contracted but >50% | <50% of contracted |
| Days since last login by primary user | <7 | 7–30 | >30 |

### 2. Workflow adoption

| Indicator | Green | Yellow | Red |
|---|---|---|---|
| Maker/checker pipeline used | Always | Inconsistent | Rarely or never |
| Audit pack generated last quarter | Yes, on schedule | Yes, but late | No |
| Effectiveness tests run quarterly | All hedges | Most hedges | Spotty or none |
| ERP / data integration | Live and stable | Working but with friction | Manual fallback in use |

### 3. Stakeholder engagement

| Indicator | Green | Yellow | Red |
|---|---|---|---|
| Original buyer still in role | Yes, engaged | Yes, but disengaged | No (left, role changed) |
| Treasurer/Controller responsiveness | <2 business days | 3–5 business days | >1 week or non-responsive |
| Executive sponsor active | Yes (QBR attended) | Sponsor exists but absent | No clear sponsor |
| Champion or new fan emerging | Yes — someone advocates internally | Neutral team | Active detractor identified |

### 4. Outcomes

| Indicator | Green | Yellow | Red |
|---|---|---|---|
| Stated benefits realized (per onboarding closeout) | Yes, customer references them | Partial | Customer says benefits not realized |
| Audit cycle outcome | Auditor accepted ORDR pack | Some friction with auditor | Auditor rejected or deeply questioned |
| Time saved vs. baseline | Customer reports >10 hrs/month saved | Marginal saving | No saving claimed |

### 5. Commercial signals

| Indicator | Green | Yellow | Red |
|---|---|---|---|
| Invoices paid on time | Always | Occasional late | Pattern of late |
| Discount asks at renewal | Reasonable / none | Material discount asked | Aggressive renegotiation tactics |
| Multi-year commitment willingness | Open to discussing | Resistant | Wants quarterly only |
| Reference willingness | Yes, public | Yes, anonymous | No |

### 6. Support / friction

| Indicator | Green | Yellow | Red |
|---|---|---|---|
| Support tickets per month | <3 | 3–10 | >10 (or sentiment) |
| Open Sev-2+ tickets at month-end | 0 | 0–1 | >1 unresolved |
| Last bad incident impact | None recent | Recent but well-handled | Recent and customer dissatisfied |
| Escalation in last 90 days | None | One, resolved | Active or repeated |

---

## Roll-up rule

The customer's color is the **worst** of the six dimensions, with one tiebreaker:

- **3+ Yellow dimensions** rolls up to **Red overall** even if no single dimension is Red

The CSM writes a one-line "why" for the rolled-up color. "Green — usage strong, sponsor engaged, last QBR positive" or "Yellow — primary buyer left in March; new contact is the controller, not yet engaged."

---

## Scoring cadence

| Customer state | Cadence |
|---|---|
| Green | Monthly review (15 min, written) |
| Yellow | Weekly review (15 min, written) + founder informed by email |
| Red | Weekly review (30 min, with intervention plan) + founder leads |
| Renewal within 60 days | Weekly regardless of color |
| Renewal within 30 days | Bi-weekly stand-up regardless |

The score is **always written down**. Verbal "they're fine" is not a score.

---

## Templates

### Monthly score entry

```markdown
# [Customer Name] — Health Score — [YYYY-MM]

**Color:** 🟢 / 🟡 / 🔴
**Trend vs last month:** ↑ / → / ↓
**Renewal date:** [YYYY-MM-DD]
**ACV:** $[N]

## Dimension scores
- Usage: 🟢 / 🟡 / 🔴 — [one-line note]
- Workflow adoption: 🟢 / 🟡 / 🔴 — [one-line note]
- Stakeholder engagement: 🟢 / 🟡 / 🔴 — [one-line note]
- Outcomes: 🟢 / 🟡 / 🔴 — [one-line note]
- Commercial signals: 🟢 / 🟡 / 🔴 — [one-line note]
- Support / friction: 🟢 / 🟡 / 🔴 — [one-line note]

## Open risks
- [Bullet]
- [Bullet]

## Open opportunities
- [Bullet — e.g., expansion, reference call willingness, case study]

## Action this month
- [Bullet — owner — date]
```

Stored at `.claude/state/customer-health/[customer-slug]-[YYYY-MM].md` initially; once we have a CRM, ported to CRM with the same structure.

### Weekly Yellow/Red intervention plan

```markdown
# [Customer Name] — Intervention Plan — [YYYY-MM-DD]

**Color:** 🟡 / 🔴
**Days to renewal:** [N]
**Worst dimensions:** [list]

## What we're doing this week
- [Action — owner — by when]
- [Action — owner — by when]

## What we asked the customer for
- [Specific ask + their response]

## What's escalated
- [Founder action / advisor input / partner intro]

## What we'll know by [next week]
- [Decision-making milestone]
```

---

## Common patterns and what they mean

### "Usage Yellow but everything else Green"

Often the customer has stable mid-tier usage that's settled below original projection. Action: confirm whether it's a Real Drop or a Right-Sizing. If right-sizing, plan a tier downgrade at renewal — better than losing them. Have the conversation early.

### "Usage Green but Stakeholder-Engagement Red"

Buyer left, replacement isn't engaged yet. Highest churn-risk pattern. Action: founder reaches out for a fresh kickoff with the new stakeholder *immediately*. Reset the relationship from scratch.

### "Outcomes Yellow"

Customer is using ORDR but not realizing the value they signed up for. Often onboarding-closeout outcomes were aspirational. Action: a value-realization workshop — concrete, hands-on, with their data. Better than a generic QBR.

### "All Green except Commercial Signals Red"

Procurement-driven renegotiation pressure even though the relationship is healthy. Action: founder + CFO conversation; sometimes a multi-year deal at flat pricing solves both sides.

### "Support Red with everything else Green"

Specific bug or operational pain. Action: dedicated engineering attention until resolved + a written acknowledgment to the customer. Don't let one issue corrode an otherwise healthy relationship.

### "Yellow → Red within one month"

Almost always a single human change — a new CFO, a new auditor, a layoff. Action: founder calls, listens, and reassesses fast.

---

## What this rubric is NOT

- **Not a churn predictor.** It's a forced disciplined review. Churn signals come from many places; the rubric just makes you look at the right places monthly.
- **Not a basis for compensation.** Especially in the early years. If CSM compensation depends on green scores, the scores will all be green and the rubric becomes useless.
- **Not a replacement for talking to the customer.** It tells you *whether* to talk; the score itself never tells you what's wrong.
- **Not exhaustive.** A signal not listed here is still a signal. The rubric is a floor, not a ceiling.

---

## Quarterly review

Once a quarter, the founder reviews:

- Distribution of customers across Green/Yellow/Red
- Any customer that moved to Red in the quarter — case study
- Any customer that moved Red → Green — what worked
- Patterns across the dimensions — is one dimension consistently Yellow across many customers? That's a product or operational signal, not a customer-specific one
- Reference of the rubric itself: is anything missing or noisy?

The rubric is a living document. Update it after every churn event with what we should have noticed earlier.
