# ORDR TreasuryFX — Founder-Led Sales Runbook

**Audience:** You (the founder), and the first GTM hire when one comes on board.
**Purpose:** Daily/weekly playbook for the first 100 days of paid commercial motion.
**Operating principle:** Build a repeatable system before you hire. Sales process > sales talent.

---

## The first 100 days

### Days 1–14 — Foundation
Goal: Be ready to take a meeting tomorrow without scrambling.

- [ ] Domain registered: `ordrtreasuryfx.com`
- [ ] Email aliases: hello@, security@, sales@, founders@
- [ ] Calendly with two slot types: 15-min intro, 30-min technical deep-dive
- [ ] Marketing site live (landing + pricing + security pages from `landing-page-copy.md`)
- [ ] All three decks exported as PDFs (prospect / investor / auditor)
- [ ] Demo tenant separated from prod, seeded with realistic synthetic data
- [ ] ROI calculator live (web version or Excel sent on request)
- [ ] Outbound list of 100 qualified prospects (see filter criteria in `outbound-templates.md`)
- [ ] LinkedIn profile updated, banner image with the tagline
- [ ] CRM set up (start with a Google Sheet, move to HubSpot/Attio at 50+ active opps)

### Days 15–45 — First 50 conversations
Goal: 50 first-meetings booked.

**Daily cadence (founder, 90 min/day on outbound):**
- 30 min: 10 personalized cold emails (from sequences in `outbound-templates.md`)
- 15 min: 5 LinkedIn connection requests + 3 personalized DMs to existing connections
- 15 min: 1–3 voicemails if you have a list of phone numbers
- 30 min: Reply to inbound + book meetings + follow-ups

**Weekly cadence:**
- Monday: review pipeline, plan the week, top 5 priorities
- Wednesday: pipeline call with advisor (if you have one)
- Friday: write a 1-paragraph weekly retro: meetings, learnings, blockers

**Daily numbers to track:**
| Metric | Target (week 4 onwards) |
|---|---|
| Cold emails sent / day | 10 |
| Reply rate | 8–15% |
| Meetings booked / week | 5 |
| Meetings held / week | 3 |
| Active opportunities | 8–15 |
| Closed-won / month (target) | 1 by month 3 |

### Days 46–75 — First close
Goal: Sign first paid customer (or first paid design partner at $12k–$24k).

**Closing checklist:**
- [ ] Prospect has met with you 3+ times
- [ ] Prospect has involved their auditor or risk officer
- [ ] Security questionnaire returned (use `security-questionnaire.md`)
- [ ] Pricing discussed; tier confirmed
- [ ] MSA + Order Form sent
- [ ] Mutual close plan with named milestones and dates
- [ ] No outstanding "blockers" — everything tracked

**Common deal blockers and unblocks:**

| Blocker | Unblock |
|---|---|
| "We need SOC 2 Type II" | Send Type I + bridge letter + audit timeline letter from auditor |
| "We need to talk to a customer reference" | Use design partner if you have one; offer founder-to-founder call as substitute if not |
| "Our budget cycle starts next quarter" | Pre-sign with start date + payment terms aligned to budget cycle |
| "We need our auditor to bless it" | Offer free auditor walkthrough — invite their Big 4 directly |
| "We want a pilot first" | Convert to Starter tier ($24k) for 90 days, no commitment to upgrade |

### Days 76–100 — Repeat + recruit
Goal: Second paid close, hire GTM #1 if pipeline supports it.

- [ ] Second paying customer signed
- [ ] First customer reference recorded (5-min testimonial video + written quote)
- [ ] One case study published on the marketing site
- [ ] If pipeline > $300k qualified: start GTM hire #1 (ex-Reval/Kyriba/FXall AE preferred)
- [ ] Begin Big 4 audit firm partnership conversation (target one Big 4 partner who knows treasury)

---

## The sales process — stages and exit criteria

| Stage | Definition | Exit criteria |
|---|---|---|
| **0. Targeted** | On the outbound list, not yet contacted | First touch sent |
| **1. Engaged** | Replied / accepted LinkedIn / visited site | Discovery call booked |
| **2. Discovery** | First 15-min call held | Next meeting scheduled with at least one additional stakeholder |
| **3. Demo** | Technical deep-dive with risk officer or auditor | Security pack requested |
| **4. Procurement** | Security questionnaire returned, pricing discussed | MSA / Order Form sent |
| **5. Verbal** | Decision-maker confirms intent to buy | Signed paperwork |
| **6. Closed-won** | Contract signed, payment received | Implementation kickoff scheduled |

Disposition options at any stage:
- `closed-lost` (with reason: budget / fit / competitor / no-action)
- `nurture` (re-touch in 90 days)
- `disqualified` (wrong customer, mark and move on)

---

## Discovery call — 15-minute script

**Minutes 0–2 — Frame:**
> "Thanks for the time. The goal of this call is for me to understand your treasury setup and for you to decide if a follow-up makes sense. If at any point this doesn't fit, just say so — I won't take offense."

**Minutes 2–8 — Discovery (3 questions, listen):**
1. "Tell me how your team handles hedge accounting today — IFRS 9 effectiveness, designation, journal entries — what's the current process?"
2. "How does your audit cycle handle hedge documentation? Any pain points your auditor has flagged?"
3. "Are you in scope for EMIR / MiFID / CFTC reporting? How is that handled today?"

Listen for the keyword *"Excel"* or *"spreadsheet."* When you hear it, you have a qualified prospect.

**Minutes 8–13 — Position:**
> "Based on what you described, here's why our other customers picked us:
> - For [pain point 1 they mentioned]: [matching ORDR feature]
> - For [pain point 2]: [matching feature]
> - And the part most treasurers don't expect — every calculation is signed and replayable for your auditor. [If they're a CFO/Audit/Risk angle: lead with this.]
>
> Three tiers, $24k–$144k+. Most teams your size pick Professional at $72k. Implementation is 90 days."

**Minutes 13–15 — CTA:**
> "Two next steps that make sense:
> 1. Technical deep-dive with your risk officer or controller — 30 minutes, I'll show the audit chain live.
> 2. If you'd rather see paperwork first, I'll send the security pack and pricing one-pager.
>
> Which is more useful?"

---

## Common objections — playbook

(Cross-reference Appendix B in `go-to-market-analysis.md`. Top hits below for daily reference.)

**"We already have Kyriba."**
> "Most of our customers keep Kyriba for cash management. We replace the hedge-accounting and governance layer that lives next to it — usually a spreadsheet stack and an email approval thread. Are you happy with how those parts of the workflow run today?"

**"We're too small for this."**
> "Starter tier is $24k. The math: most teams recover ~$70k/yr in hedge-accounting labor. If your treasury team is rebuilding effectiveness in spreadsheets, the platform pays for itself in the first audit cycle."

**"What about an AI-driven platform?"**
> "We deliberately don't have ML in the engine. Two reasons. One: regulators are increasingly skeptical of opaque optimization in regulated workflows. Two: when your auditor says 'reproduce this calculation' you can't reproduce a model that's drifted. Determinism is the product."

**"We need SOC 2 Type II first."**
> "Audit is in progress. Type I + bridge letter are available under NDA today. Timeline: [date]. If that's blocking, we can structure the Order Form to activate on Type II issuance — that's a common path for procurement-conscious customers."

**"Send me a proposal."** *(end of first call — usually a polite no)*
> "Happy to. Two questions to make it accurate: which tier — Starter, Professional, or Enterprise — based on what we just discussed? And who else from your team should I copy when I send the proposal? I find proposals that go to one inbox tend to die there."

---

## Pricing negotiation — guardrails

**Hold the line on:**
- Starter at $24k. No discount. The price is the price.
- Professional at $72k for the standard package.
- Implementation fees on Professional and Enterprise.

**Negotiable:**
- Payment terms (annual upfront vs. quarterly)
- Multi-year discount (10% for 2-year, 15% for 3-year, max)
- First-year discount in exchange for a logo right + reference call
- Implementation fee waiver for design partners

**Walk-away:**
- Below $20k for Starter
- Below $60k for Professional
- Uncapped liability
- Source code in escrow without Enterprise tier
- "MFN clause" (most-favored-nation pricing) — never agree

If the prospect insists on a price below floor, offer a smaller scope (single-entity Starter instead of multi-entity Professional) before discounting. Keep the per-feature value intact.

---

## Hand-off to implementation

Day after contract signing:

- [ ] Welcome email from founder + customer success lead (or founder-as-CS for first 5 customers)
- [ ] Tenant provisioned in correct region
- [ ] SSO config initiated (if Enterprise)
- [ ] Kickoff call scheduled within 5 business days
- [ ] Implementation plan delivered (90-day Gantt for Professional, 120-day for Enterprise)
- [ ] First-week milestones agreed
- [ ] Slack/Teams shared channel set up

Run a 30/60/90-day check-in cadence. Track three numbers: time to first live hedge, NPS at day 90, expansion appetite at day 90.

---

## Inbound playbook

When a prospect comes inbound (form fill, email, LinkedIn DM):

1. **Reply within 60 minutes** during business hours. Within 4 hours otherwise.
2. **First reply is one paragraph + one calendar link**, no marketing fluff.
3. **Disqualify fast** if they fail firmographic filters (sub-$50M revenue, banks/dealers, wrong geo) — politely refer elsewhere.
4. **Treat inbound 3x as serious as outbound** — they self-identified, they're closer to buying.

---

## Tools stack (recommended for the first 12 months)

| Need | Tool | Cost / mo |
|---|---|---|
| CRM | HubSpot Starter (or Attio) | $20 |
| Email warming + sending | Smartlead / Instantly | $40 |
| Calendar | Calendly Pro | $10 |
| Email | Google Workspace Business Standard | $14 |
| Document signing | DocuSign / Dropbox Sign | $30 |
| Analytics | Plausible (privacy-friendly) | $9 |
| Status page | Better Uptime / Statuspage | $30 |
| Demo / video | Loom + Calendly + Figma slides | $25 |
| Compliance evidence vault | Drata / Vanta | $400 |

Total: ~$580/mo. Add SOC 2 audit (~$25k/yr) and pen test (~$15k/yr) and you're at ~$50k/yr in non-people GTM cost.

---

## Closing thoughts

1. **Treasury sales cycles are 60–180 days.** Plan accordingly. Don't panic in month 2.
2. **The treasurer is the user, but the auditor is the closer.** Always make sure the auditor sees the platform.
3. **Procurement is a feature, not an obstacle.** Ship the security pack, MSA, DPA, sub-processor list before they ask.
4. **The first 5 customers are about learning, not revenue.** Take fewer dollars to get tighter case studies.
5. **Brevity wins.** A 30-second voicemail beats a 90-second one. A 6-line email beats a 12-line one. Get to the point.
