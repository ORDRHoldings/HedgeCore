# Demo Environment Runbook

**Audience:** Anyone giving a live demo of ORDR TreasuryFX
**Goal:** A polished, repeatable, never-broken demo tenant with realistic but synthetic data, set up in <30 minutes.

A bad demo loses a deal in 6 minutes. A great demo can close one in 25.

---

## Demo personas

We maintain three named demo tenants. **Never** demo using the prod marketing tenant or a real customer's tenant.

| Tenant | Persona | Use for |
|---|---|---|
| **demo-acme** | Acme Manufacturing — global manufacturer, $400M FX hedged annually, Excel→ORDR migration | Mid-market manufacturer prospects |
| **demo-northbeam** | Northbeam SaaS — $80M FX hedged, US/EU subsidiaries, ASC 815 cash-flow hedges | SaaS / scale-up prospects |
| **demo-meridian** | Meridian Industries — $1.8B FX hedged, 15 entities, IFRS 9 net-investment hedges, Big-4 audit | Enterprise prospects |

Pick the persona closest to the prospect's profile. If unsure, default to demo-northbeam — its mid-size profile flexes both up and down without looking artificial.

---

## Pre-demo checklist (1 hour before)

- [ ] Open the demo tenant URL and log in successfully
- [ ] Verify market data is fresh (FX rates updated within the last 60 minutes)
- [ ] Hash-chain integrity check passes (Audit Lab → Verify Chain)
- [ ] One pending proposal exists to demo the maker/checker flow
- [ ] One historical hedge cycle visible in the ledger to demo the audit pack
- [ ] Reports Studio has at least one custom report saved
- [ ] No console errors in the browser (open DevTools, refresh, check)
- [ ] Demo browser profile is clean: no other tabs, no notifications, dock icons hidden, no Slack/email
- [ ] Screen-sharing resolution set to 1920×1080 minimum
- [ ] Backup demo tenant available in case primary breaks

---

## Demo flow — the 25-minute version

This is the standard. Do not exceed 25 minutes of demo time on a 30-minute call. Leave 5 for Q&A.

### Minute 0–2: Anchor on what matters to *them*

> "From your questionnaire, the three things that matter most are [X, Y, Z]. I'm going to show you all three, in that order, and skip the rest. If we have time we'll go to the rest at the end."

Never start with "let me give you a tour." A tour is an admission you don't know what they want.

### Minute 2–8: The day-to-day workflow

Show the **Position Desk**. Walk through:

- A live list of currency exposures
- Click into one exposure → see the hedge proposal
- The deterministic engine produces a hedge ratio + recommended forward
- Show the audit log entry that just got created

**Talking points:**
- "This is what your treasurer does in the morning. From login to approved proposal: under 5 minutes."
- "Every click here is logged to the immutable audit trail. We'll see that in a minute."

**Avoid:**
- Configuration screens — boring
- Settings — boring
- Anything that says "Coming soon" — credibility-destroying

### Minute 8–14: Hedge accounting & audit pack

Switch to **Hedge Effectiveness**. Walk through:

- An effectiveness test on the hedge from the previous segment
- Critical-terms-match for forwards (or regression for the Meridian persona)
- The auto-generated audit memo

Then **Audit Lab**:

- Show the WORM event stream
- Click "Verify Chain" — show the integrity check pass with timestamp
- Export a sample audit pack (it should download a tidy ZIP)

**Talking points:**
- "Your auditor opens this and gets every input, every parameter, every output, and a cryptographic proof that none of it has been altered since the day it was written."
- "If the chain ever fails to verify, we treat it as a security incident — regardless of cause."

**This is the moment that closes audit-anxious prospects.** Slow down. Don't rush past it.

### Minute 14–20: The persona-specific module

Pick **one** module to deep-dive based on the prospect's pain:

- **TCA** for prospects who flagged best-ex (MiFID II) as a concern
- **Counterparty Hub** for prospects with multiple banking relationships
- **Regulatory Submissions** for EMIR / CFTC reporters
- **Natural Hedging** for multi-entity multinationals
- **Reports Studio** for prospects who said month-end takes too long

Don't try to demo two. One demo'd well > two demo'd poorly.

### Minute 20–24: The governance pipeline (Enterprise demos only)

For Enterprise prospects, walk through:

- Maker creates a proposal in Sandbox
- Approver reviews in Staging — show the SoD enforcement (the maker cannot approve)
- Approver approves → proposal lands in Ledger
- Show the WORM commit and the chain advance

For Starter/Professional prospects, **skip this** — it's a deal-killer if you over-pitch governance to a 1-person treasury team.

### Minute 24–25: Bridge to next steps

> "We've covered [X, Y, Z]. Here's what we'd typically do from here:
>
> 1. Send you the security questionnaire and trust center to share with IT/audit
> 2. A 30-minute follow-up with [whoever they said] to go deeper on [their #1 concern]
> 3. A 90-day onboarding plan, with the goal of your first live hedge through ORDR by [date]
>
> Does that map to how you'd want to evaluate this?"

Then **stop talking** and let them respond.

---

## Demo data setup

Each persona's tenant has a one-command reset:

```bash
# From the backend repo
python scripts/seed_demo.py --persona acme --reset
python scripts/seed_demo.py --persona northbeam --reset
python scripts/seed_demo.py --persona meridian --reset
```

The script:

1. Drops and recreates the tenant's data (preserves the user accounts)
2. Loads exposures, hedge proposals, completed hedges, and audit events
3. Generates 6 months of historical hedge cycles
4. Creates one pending proposal awaiting approval
5. Validates hash chain integrity and prints the head hash
6. Prints credentials to use in the demo

Run the reset **the morning of every demo**. Stale demo data is the #1 cause of "wait, why is this number weird?" moments.

> If `scripts/seed_demo.py` does not exist yet, build it before the next major prospect call. It's a 1-day investment that pays back from the second demo onward.

---

## Demo accounts (per tenant)

| Role | Username | Password | Use for |
|---|---|---|---|
| Treasurer | treasurer@[persona].demo | (in 1Password) | Daily workflow demo |
| Approver | approver@[persona].demo | (in 1Password) | Maker/checker demo |
| Auditor (read-only) | auditor@[persona].demo | (in 1Password) | Audit-pack demo for auditor stakeholder |
| Admin | admin@[persona].demo | (in 1Password) | Setup only — never demo with admin |

Always demo as the role the prospect's stakeholder will actually use. Never demo from the admin role; it makes the platform look more complicated than it is.

---

## Common demo failures and how to recover

### Market data is stale

Symptom: FX rates haven't updated; quotes look obviously wrong.

Recovery:
- Don't apologize at length
- Say: "I'm seeing stale market data — let me switch to a screenshot of yesterday's quotes for this part." Have screenshots ready.
- Fix the demo tenant immediately after the call

### Backend slow / spinner forever

Symptom: A click takes >10 seconds.

Recovery:
- Don't fill the silence with apologies
- Say: "While that loads, let me show you [unrelated screenshot or diagram]"
- If it doesn't recover in 20 seconds, switch to the backup tenant

### A feature breaks live

Symptom: An error message appears.

Recovery:
- Don't try to debug live
- Say: "Looks like that's hitting a glitch in the demo tenant — same code as production, just a data issue here. Happy to walk through it on a follow-up screen-share, or I can show the same flow in [other persona]."
- Continue smoothly

### Prospect asks "how does X work?" and you don't know

Recovery:
- "Great question — that's specific enough I'd rather give you a precise answer than wing it. I'll send you a written response by [tomorrow]."
- Then actually do it. Send the written response with a CC to the prospect's stakeholder list.

### Prospect asks for a feature that doesn't exist

Recovery:
- "We don't have that today. Tell me more about how you'd use it — I want to understand whether it's on our 6-month plan or whether we'd be the wrong fit for that requirement."
- Never say "we're working on it" if we're not. The credibility cost is enormous.

---

## Recording and follow-up

- **Always offer to record** the demo and send the recording. Some prospects decline (regulated industries); that's fine.
- **Send a follow-up within 4 hours** with: recap of their three concerns, what we showed, the assets they should review (security questionnaire, ROI calculator, trust center), and the proposed next call.
- **Tag the demo in CRM** with: persona used, modules demo'd, prospect's reaction (engaged / cool / skeptical), and the deal-flag (hot / warm / cold).

---

## Demo hygiene rules

1. **Never** show the marketing site during a demo unless the prospect specifically asks for it
2. **Never** show internal admin or operator screens — even if they ask. "That's an internal-only tool; what I can show is what your team would use."
3. **Never** type passwords on screen. Always use 1Password autofill.
4. **Never** click into another customer's tenant by accident. Each demo tenant should be in a labeled browser profile.
5. **Always** demo on a wired connection or a strong, tested wi-fi. A frozen demo loses the deal regardless of cause.
6. **Always** have the backup tenant URL bookmarked.
7. **Never** apologize more than once for any issue. Fix it, move on.

---

## Quarterly demo health check

Once a quarter, do a full review:

- Run all three persona resets
- Walk every demo persona through the 25-minute flow
- Update screenshots in the prospect deck if any UI has shifted
- Update talking points if any module has materially changed
- Refresh any data that looks dated (e.g., 2025 dates that should be 2026 now)

The demo environment is a living asset. It rots if not maintained.
