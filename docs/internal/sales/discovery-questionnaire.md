# Discovery Questionnaire

**Use:** Send to qualified prospects 48 hours before the first call. The goal is to get the discovery call from "tell me about ORDR" to "let me show you exactly what would solve your top three problems."

**Length target:** 12 questions, ~10 minutes to fill in. Anything longer kills response rate.

**Format:** Email-friendly markdown so prospect can paste into a reply. Convert to a Notion form once we have the brand domain.

---

## Email body when sending

```
Subject: Quick prep for our [Day] call — 12 questions

Hi [Name],

To make our [Day] call as useful as possible, would you be open to answering the questions below before then? It usually takes ~10 minutes and lets me skip the generic demo and go straight to what matters for [Company].

If anything is sensitive, just write "happy to discuss live" and we'll cover it on the call.

[Paste questionnaire below]

Thanks,
[Sender]
```

---

## The questionnaire

### A. Your treasury function (3 questions)

**A1. Which of these best describes your treasury organization?**

- [ ] One full-time treasurer + 0–1 analyst
- [ ] 2–4 person treasury team reporting to CFO
- [ ] 5–10 person team with formal Treasury Committee
- [ ] >10 person team, multiple regions, board-level treasury policy
- [ ] Other (describe): ____________________

**A2. What FX volume do you hedge in a typical year?** (notional, USD-equivalent — best estimate is fine)

- [ ] < $50M
- [ ] $50M – $250M
- [ ] $250M – $1B
- [ ] $1B – $5B
- [ ] $5B+

**A3. How many legal entities are in scope for hedge accounting today?**

- [ ] 1
- [ ] 2–5
- [ ] 6–15
- [ ] 16–50
- [ ] 50+

### B. What you do today (3 questions)

**B1. Where does the hedge calculation actually happen today?** (the math, not the policy)

- [ ] Excel maintained by Treasurer
- [ ] Excel maintained by accounting / external advisor
- [ ] Treasury management system (which?): ____________
- [ ] In-house tool (built by us)
- [ ] Bank's portal
- [ ] Combination — please describe: ____________

**B2. How long does it take to produce a quarterly hedge effectiveness pack for the auditors?**

- [ ] Under 1 day
- [ ] 1–3 days
- [ ] 3–7 days
- [ ] 1–2 weeks
- [ ] More than 2 weeks

**B3. What's the worst part of the current process — what would you most like to never do again?**
(One sentence is fine.)

____________________________________________________

### C. What you'd want from a platform (3 questions)

**C1. Rank these from most important (1) to least important (5) for your situation:**

- [ ] _ Reduce time spent on month-end / quarter-end hedge accounting
- [ ] _ Have an audit-defensible record of every decision
- [ ] _ Reduce the audit fee or audit pain
- [ ] _ Pre-trade transaction cost analysis (best-execution evidence)
- [ ] _ Direct integration with our ERP

**C2. Does your auditor flag treasury / hedge accounting as a material risk in your audit?**

- [ ] Yes — they've asked for more controls or evidence
- [ ] Sort of — they've made comments but nothing material
- [ ] No
- [ ] Don't know

**C3. Which of these would block a purchase decision for you, even if the platform was perfect?**

- [ ] SOC 2 Type II not delivered yet
- [ ] No on-prem option
- [ ] No specific ERP connector (which?): __________
- [ ] Data residency requirement (which jurisdiction?): __________
- [ ] Approval from legal / compliance team needed first
- [ ] Approval from IT / security team needed first
- [ ] None of these — we can move quickly

### D. The buying process (3 questions)

**D1. If we were a great fit, what's the realistic earliest you could be live in production?**

- [ ] 30 days
- [ ] 60 days
- [ ] 90 days
- [ ] This calendar half
- [ ] Next calendar half
- [ ] No defined timeline

**D2. Who else would need to weigh in on a decision like this?** (we'll bring tailored materials for each)

- [ ] CFO
- [ ] Controller
- [ ] CISO / IT security
- [ ] Internal audit
- [ ] External audit
- [ ] Procurement / legal
- [ ] Other: __________

**D3. What's your budget situation for treasury tooling in the current planning cycle?**

- [ ] Budget allocated, looking for the right vendor
- [ ] No allocated budget but a strong case can unlock it
- [ ] Will need to wait for next budget cycle
- [ ] Don't know
- [ ] Prefer to discuss live

---

## How we use the answers

| Answer pattern | What we do |
|---|---|
| A1 = 1-person team + B1 = Excel | Lead with audit-pack speed and treasurer's daily workflow; skip enterprise governance |
| A2 = >$1B + multiple entities | Lead with hedge effectiveness automation and tri-state pipeline |
| C1 ranks "audit-defensible" #1 | Lead with WORM + hash chain demo |
| C2 = "auditor flagged as risk" | Bring the auditor deck to the demo; offer to talk to their auditor |
| C3 = "SOC 2 not delivered" blocking | Send the readiness attestation immediately; offer SOC 2 contingency clause |
| D1 = 30 days | This is a hot deal — move to commercial conversation immediately |
| D2 includes CISO + audit + IT | Plan for a multi-call sequence, not a single demo |
| D3 = "no budget" | Slow this down; nurture with the ROI calculator |

---

## When to send vs. not send

**Send to:**

- Prospects who responded to outbound and asked for a call
- Inbound leads who self-identified as treasurer / CFO / controller
- Anyone who attended a webinar and booked a follow-up
- Warm intros where the introducer told us "they're serious"

**Don't send to:**

- The first 3 minutes of a cold inbound — too much friction; have the discovery call first
- Investors doing diligence — they have their own questionnaire
- Existing customers — that's a renewal-conversation, not a discovery
- Procurement contacts when we haven't talked to the buyer yet

---

## Failure modes

- Prospect doesn't fill it in: don't push; have the discovery call anyway, and ask the questions live
- Prospect fills in 3 of 12: still useful; build on what they gave you
- Prospect resists with "let's just talk on the call": absolutely fine; this is a tool, not a gate

The questionnaire is for our prep, not their qualification. If you find yourself thinking "they didn't answer the questionnaire so they're not serious," reset.

---

## Variants

- **Investor variant**: replace D1–D3 with "fund stage / check size / decision timeline / cap-table preferences"
- **Big-4 partner variant**: replace section B with "what's your firm's current treasury practice / how many clients hedge / what audit fee range"
- **ERP partner variant**: replace section C with "which customer profile would you co-sell to / what's the ERP version mix / do you have a connector kit"

These variants live in the same file because the form scaffolding is identical; only the body changes.
