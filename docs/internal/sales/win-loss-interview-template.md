# Win/Loss Interview Template

**Use:** Run a structured 30-minute call with the buyer (and ideally one other stakeholder) within 30 days of any deal closing as a Won, Lost, or No-Decision. The output goes into the win/loss log and feeds product, GTM, and pricing decisions.

**Cadence target:**
- 100% of losses interviewed
- 100% of no-decisions interviewed
- 50%+ of wins interviewed (sample, not all — but the first three of any new ICP segment, always)

---

## Why we run this

A pipeline closes for a reason. We learn the reason or we keep guessing.

The interview's value is the *opposite* of the salesperson's instinct: when you lose, you assume it's about price; when you win, you assume it's about the demo. Both assumptions are wrong half the time. The interview surfaces the actual driver.

---

## Who runs the interview

- **Not the salesperson** who worked the deal. They are too close.
- **Founder** for early customers (first 20). Founder time invested here pays back at 10×.
- **A peer** salesperson if/when the team grows
- **An external researcher** (occasional) for bigger deals where the buyer would be more candid with a third party

---

## Pre-interview prep (30 min)

- Read the CRM record end-to-end
- Read every email in the deal thread
- Read any Slack/Teams notes from the deal team
- Know the exact pricing offered, the exact terms, the exact timeline
- Identify the buyer's stated objections during the cycle
- Identify the buyer's stated reasons for the outcome
- Form a hypothesis about the *real* reason (not the stated one) — this is what you're testing

---

## The interview script

### Open (2 min)

> "Thanks for taking the time. Before we start: this is for our learning, not a sales conversation. I'm not going to try to re-open anything; I just want to understand what happened. Anything you say I can attribute back to your team unless you ask me not to. Is that okay?"

Wait for confirmation. Then:

> "Three categories of questions: how you evaluated, what drove the decision, and what we could have done differently. About 20 minutes of questions, then a few minutes for you to ask me anything."

### Section 1: How they evaluated (5 min)

1. "Walk me through the evaluation. Who was involved? What was the timeline?"
2. "What was the trigger that started this — what made you look at this category in the first place?"
3. "What other vendors did you evaluate seriously? How did you decide which to look at?"
4. "What was the most useful thing any vendor (us or another) gave you during the cycle?"
5. "What was the *least* useful?"

Listen for: who actually had decision authority (often different from the title); whether ORDR was in the consideration set as a peer or as a long-shot; what artifacts moved the conversation forward vs. stalled it.

### Section 2: What drove the decision (8 min)

For Won deals:

6. "What was the single biggest reason you chose us?"
7. "What was the closest competitor and what would have made you choose them?"
8. "What concerns did you have about ORDR that you had to overcome internally?"
9. "Was there a moment where you thought 'this is the one' — and what triggered it?"
10. "If we had been 30% more expensive, would you still have chosen us? At what price would you have gone with [closest competitor]?"

For Lost deals:

6. "What was the single biggest reason you didn't choose us?"
7. "What did the winner do that we didn't?"
8. "Was there a moment where the deal turned away from us — what triggered it?"
9. "Were there concerns about ORDR specifically that we couldn't address?"
10. "If we had been 30% cheaper, would you have chosen us? What about 50%?"

For No-decision:

6. "What changed? Why did the project pause / die?"
7. "If something changed in the next 6 months, what would re-open this?"
8. "Was the project the wrong priority, or was the category the wrong fit, or was ORDR specifically the wrong fit?"
9. "Did your evaluation help you internally — even though no purchase happened?"
10. "Is there a different problem we could have helped you with?"

Listen for: the *real* objection (which is usually different from the stated one); the persona who was actually decisive; whether the deal was killable at any earlier stage.

### Section 3: What we could have done differently (5 min)

11. "If you were running our sales process, what would you change?"
12. "Was there a piece of information you wanted from us that we didn't provide quickly enough?"
13. "Was there a stakeholder we should have engaged earlier?"
14. "Was there anything about our product, our pricing, or our team that surprised you — positively or negatively?"
15. "If you were giving advice to a peer evaluating us, what would you tell them?"

Listen for: friction points in our process; misalignment between what we offered and what they bought; assets we should have produced.

### Close (2 min)

> "Two final questions, if you're up for them: first, would you be open to a follow-up in 6 months to see how things have evolved? Second, who else should I be talking to in your network — anyone facing a similar problem?"

The first locks in a future touchpoint without trying to re-open the deal. The second sometimes generates a referral.

> "And if there's anything else on your mind that I haven't asked, I'm all ears."

The freeform end-question often produces the most useful insight in the entire interview.

---

## Note-taking format

A clean format that's easy to read and easy to grep later:

```
# Win/Loss Interview — [Customer Name]

**Outcome:** [Won / Lost / No-decision]
**Interview date:** YYYY-MM-DD
**Buyer:** [Name, Title]
**Other stakeholders interviewed:** [Names]
**Interviewer:** [Name]
**Duration:** [N min]
**Recording (if consented):** [link / "not recorded"]

## TL;DR
[One paragraph: real reason for the outcome, biggest insight, one action item.]

## Process
[How they evaluated — who, when, what triggered]

## Decision driver
[What actually drove the decision in their words]

## What we did well
- [Bullet]
- [Bullet]

## What we did poorly
- [Bullet]
- [Bullet]

## What surprised the buyer
- [Bullet]

## What surprised us
- [Bullet]

## Verbatim quotes (with permission)
> "[Quote]"
> "[Quote]"

## Action items
| # | Action | Owner | Target |
|---|---|---|---|
| 1 | [specific thing we'll change] | [name] | [date] |
```

Stored at `.claude/state/win-loss/[YYYY-MM-DD]-[customer-slug].md` (or a Notion table once we have one).

---

## Aggregate review

Once a quarter, the founder reviews all win/loss notes from the prior quarter and produces:

1. **Top 3 patterns in losses** — with proposed changes
2. **Top 3 patterns in wins** — with reinforcement plans
3. **Pricing-elasticity signal** — was 30% off enough to win? Was 30% more enough to lose?
4. **Persona-decisiveness signal** — who actually decided across the wins and losses?
5. **Sales-asset signal** — which artifacts moved deals forward, which were noise?
6. **Roadmap signal** — top 3 product gaps that came up across multiple losses

The aggregate review goes into the `OPEN_RISKS.md` (if any item is a deal-killer pattern) and the GTM analysis.

---

## What to do with the insights

| Insight type | Where it goes |
|---|---|
| Sales-process change | `sales-runbook.md` updated |
| Sales-asset change | `outbound-templates.md` / `prospect-deck.md` updated |
| Pricing change | discussed with founder + advisor; may update `order-form-template.md` floors |
| Product gap | filed as a feature ticket with the win/loss reference |
| Positioning change | `go-to-market-analysis.md` updated; `landing-page-copy.md` updated |
| Pattern requiring deeper investigation | added to next quarter's interview prep prompts |

The point isn't to collect interviews — it's to change behavior based on them. An interview that doesn't produce a single change is a wasted hour.

---

## Common patterns to watch for

These are the patterns that tend to show up in early-stage SaaS win/loss data. Watch for them in our pattern; don't assume they're absent.

1. **"They went with the incumbent because of switching cost"** — really means the incumbent's switching cost is high; we need stronger migration tooling
2. **"They picked the cheaper option"** — really means we didn't make the value case strongly enough
3. **"Their team didn't have time to evaluate"** — really means we didn't engage the decision-maker, only the evaluator
4. **"Procurement killed the deal"** — really means our security/legal materials weren't ready when procurement got involved
5. **"They liked us but the project got deprioritized"** — really means we didn't connect to a deadline or compliance event
6. **"They went with [competitor we don't compete with]"** — really means we mis-qualified; this prospect was never our ICP
7. **"They went with status-quo / Excel"** — really means we didn't produce enough urgency

For each, the corrective action is in `sales-runbook.md`.

---

## Compensation alignment (when we have a sales team)

When ORDR has a real sales team, win/loss interviews must be:

- **Mandatory** for the salesperson on every loss (so they're available for the interview, not so they run it)
- **Counted as part of pipeline-hygiene OKR** — completion rate matters
- **Insulated from comp** — nobody's bonus is reduced by an honest loss interview answer
- **Anonymized in aggregate** when shared widely — nobody on the team is publicly tied to a pattern

Win/loss is a learning machine, not a performance review.
