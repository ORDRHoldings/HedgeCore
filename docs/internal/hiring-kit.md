# Hiring Kit

**Audience:** Founder + first revenue lead, when ready to hire
**Purpose:** Job descriptions, interview rubrics, compensation framework, and process for the first 5 hires after the founder

The first 5 hires after the founder are an outsized portion of company DNA. The kit makes sure each one is intentional.

---

## Hiring philosophy (read this before posting any role)

1. **Hire for the next 12 months, not for who we are today.** A senior who'd be bored at month 3 isn't right; a generalist who'd be lost at month 9 isn't right.
2. **The team is the moat.** A small senior team that can ship fast and own outcomes outperforms a larger team with division of labor.
3. **Bias to slow before hiring, fast after deciding.** A good hire compounds; a bad one consumes a year of leadership attention.
4. **Compensation transparency.** Every offer is structured against the framework below. No exceptions, no negotiation theater.
5. **Reference checks are mandatory and substantive.** Three references, two outside the candidate's submitted list. No exceptions.
6. **No "we'll figure it out later" on equity.** Vesting, cliff, acceleration are explicit at offer time.

---

## Hiring sequence (suggested order)

The order matters more than people realize. The wrong second hire can prevent the right third hire.

| # | Role | When to hire | Why this order |
|---|---|---|---|
| 1 | **Founding engineer (full-stack)** | When founder's engineering capacity is the binding constraint on shipping | Stops shipping from being founder-only |
| 2 | **First revenue lead** (founder-led-sales heir) | When founder has run 20+ deals and patterns are clear | Can systematize what founder learned |
| 3 | **Senior backend engineer** | When the engine + audit chain need a dedicated owner | Decouples production-quality work from new feature work |
| 4 | **Customer Success lead** | When customer count > 10 or any customer is at >$72k ACV | Onboarding + renewals can no longer ride founder time |
| 5 | **Senior frontend engineer / UX-aware** | When customer feedback says "the workflow is great, the UX gets in the way" | Quality of UI starts to bottleneck adoption |

After these five, the org gets specific to the path. Don't pre-plan further.

---

## Role: Founding Engineer

### One-liner

Build the next 12 months of ORDR alongside the founder, with full-stack ownership across the FastAPI backend, Next.js frontend, and operational pipeline.

### What success looks like at 12 months

- Two major modules shipped end-to-end with you as the named owner
- Production incidents resolved without founder involvement at Sev-2 and below
- A junior engineer hired by you (with founder's review) and productive by month 12
- Detailed familiarity with the engine kernel and the audit chain — this is non-delegable territory

### What we're looking for

- 6–10 years building production software, ideally in fintech, regtech, or B2B SaaS where a wrong number is a real consequence
- Strong opinions on testing, especially around deterministic systems
- Comfortable in Python (FastAPI/SQLAlchemy) AND TypeScript (Next.js/React) — you'll touch both daily
- Has shipped something where the audit posture mattered — financial controls, healthcare, government, etc.
- Is genuinely engaged by the unsexy parts of the platform (audit logs, retention, error handling)

### What we're NOT looking for

- "Senior engineer" who hasn't shipped production code in 18 months
- ML-experience-as-primary-identity — we don't have ML in the product and won't add it
- Specialist who insists on backend-only or frontend-only — this hire flexes
- Anyone whose first question is about office / remote / equity before they've understood the product

### Compensation range (at this stage)

- Cash: $130k–$170k base (US; equivalent regional bands elsewhere)
- Equity: 0.5%–1.5% (4-year vesting, 1-year cliff, 25% acceleration on double-trigger)
- Total package: $200k–$280k including equity at fair-value reasonable assumptions

Honest about cash discount vs. market: yes, this is below FAANG senior. The equity grant is meaningful and the role is direct and consequential. We say so plainly in the offer letter.

### Interview process

1. **Resume + cover letter screen** (founder, ~15 min)
2. **30-min intro call** (founder)
3. **2-hour technical pairing session** (founder + take-home review): work through a real bug or refactor in our codebase; we pair, talk through trade-offs, look at a real PR
4. **2-hour systems / architecture conversation**: design a new module from scratch end-to-end (engine + persistence + UI); discuss trade-offs
5. **Reference checks** (founder, 3 refs, two outside the submitted list)
6. **Decision call** — same day if possible

Total time investment from candidate: ~6 hours over 2–3 weeks.

### Interview rubric

Score 1–5 on each:

| Dimension | What we're scoring |
|---|---|
| **Code quality** | Readable, tested, principled. Comments only where they earn their space. |
| **Production-grade thinking** | Considers failure modes, retries, idempotency, observability without prompting |
| **Communication** | Says "I don't know" without hedging; explains complexity without showing off |
| **Domain interest** | Curious about treasury / hedging / audit; willing to learn quickly |
| **Ownership** | Talks about prior projects in first-person specifics, not "we" |
| **Pace** | Can ship a week's work in a week, sustainably |

Hire only when median score across dimensions is 4+ AND no dimension is below 3. A "5 in code, 2 in communication" doesn't work in a small team.

---

## Role: First Revenue Lead

### One-liner

Take the founder-led GTM motion and make it repeatable. Run founder-supervised deals through close. Build the playbook that the next 5 hires will execute.

### What success looks like at 12 months

- Personally closed 8–12 deals across Starter, Professional, and Enterprise tiers
- Documented win/loss patterns in writing across 30+ pipeline opportunities
- Hired a BDR and ramped them to a productive cadence
- Founder is no longer required on every deal cycle below $100k ACV

### What we're looking for

- 5–10 years selling B2B SaaS to finance, treasury, or compliance buyers
- Has carried quota AND closed 6-figure deals AND can articulate which deals they lost and why
- Comfortable being the first salesperson — no team to lean on, no SDR feeding leads
- Can write — outbound, follow-ups, proposals, customer notes, post-mortems
- Specifically motivated by founding-team equity, not by base + accelerator structure

### What we're NOT looking for

- Quota-and-leaderboard-only motivation
- "Strategic" sellers who can't write follow-up emails
- Someone who has only sold horizontal SaaS and never carried a vertical or a regulated buyer
- Anyone who pitches "I can build a sales team for you" before understanding the product

### Compensation range (at this stage)

- Cash: $130k base + $130k variable at 100% attainment, paid quarterly
- Equity: 0.4%–1.0% (4-year vesting, 1-year cliff)
- Quota: $1.5M–$2M ARR for year 1 (negotiated against pipeline visibility)
- OTE: $260k at 100%; uncapped above 100%

### Interview process

1. **Resume screen** + LinkedIn pattern check
2. **30-min intro call** (founder): why this domain, why this stage
3. **Sell-the-product back exercise**: candidate takes our public materials, runs a 20-minute discovery + demo back to founder as if founder is a prospect
4. **Pipeline-walk exercise**: candidate walks through their last 3 closed deals (won + lost) with specifics
5. **Customer / ex-buyer reference check**: at least one reference from a person they sold to (not a manager)
6. **Trial deal review**: shadow founder on a real live deal for 1–2 sessions before final offer

### Rubric

| Dimension | What we're scoring |
|---|---|
| **Selling fundamentals** | Discovery quality, demo quality, follow-through |
| **Writing** | Outbound, proposal, recap quality |
| **Domain literacy** | Doesn't fake; learns fast |
| **Founder-stage temperament** | Comfortable with ambiguity; doesn't need a sales manager |
| **Honesty about losses** | Specific, owned, learnt-from |
| **Buyer empathy** | Treats prospects as humans with jobs |

---

## Role: Senior Backend Engineer

### One-liner

Own the engine and audit-chain code path. Be the primary engineer responsible for keeping the determinism, the WORM ledger, and the hash chain unimpeachable. Senior level. Architecture freeze owner.

### What's specifically different from "Founding Engineer"

This role is **less full-stack, more deep-vertical** in the engine + audit areas. It's the right hire when the founding engineer is already at capacity on broader product work and the engine deserves dedicated ownership.

### Compensation, process, rubric

Same shape as Founding Engineer; bias to candidates with deep Python/SQLAlchemy + cryptographic systems experience over breadth. Specific bonus: experience with audit-evidence-grade systems (financial systems of record, electronic medical records, government).

---

## Role: Customer Success Lead

### One-liner

Take customers from "signed Order Form" to "fanatic reference," repeatably. Own the onboarding playbook. Catch churn signals before they fire.

### What success looks like at 12 months

- Every active customer's quarterly health-score is current and accurate
- Two customers converted to public references with case studies
- Onboarding playbook updated based on 5+ real deployments
- Founder is no longer in CS day-to-day for healthy accounts

### What we're looking for

- 4–8 years in customer success or implementation at B2B SaaS, ideally regtech / fintech / compliance
- Has owned an account book worth $5M+ ARR
- Comfortable being technical (the platform, the audit chain, the ERP integrations)
- Has read a Big-4 SOC 1 audit and not flinched

### Compensation range

- Cash: $110k–$140k base
- Variable: $30k–$50k tied to NPS / NDR / reference count
- Equity: 0.2%–0.5% (4-year, 1-year cliff)

### Interview process

1. **Resume screen + LinkedIn**
2. **30-min intro** (founder)
3. **Live customer-call exercise**: founder role-plays an unhappy customer; candidate runs a save play
4. **Onboarding-playbook critique**: candidate reads our 90-day playbook and gives 30 minutes of constructive feedback
5. **References from named customers** (not from managers)

---

## Role: Senior Frontend Engineer

### One-liner

Take the workflow-correct UI and make it a UX customers brag about. Bring institutional restraint AND modern polish.

### Specific characteristics

- Has shipped financial / dense-data UIs (Bloomberg-class, trader-class, audit-class)
- Knows the difference between "looks good" and "works at 14 hours of cognitive load"
- Can implement, not just design
- Is happy collaborating closely with designers OR being the only design voice for a year

Compensation, process, rubric mirror Founding Engineer with bias toward TypeScript/React/Next.js depth.

---

## Compensation framework (general)

### Bands

| Role tier | Base | Equity | Variable |
|---|---|---|---|
| Founding (any function) | $130–$170k | 0.5%–1.5% | None or capped |
| Senior IC | $130–$160k | 0.2%–0.6% | None |
| Functional lead (sales, CS) | $110–$140k base | 0.2%–0.5% | $30–$130k variable |
| Manager+ (post-Series A) | TBD against next round comp data | TBD | TBD |

### Equity vesting

- 4 years, 1-year cliff (standard)
- Acceleration: 25% on double-trigger (acquisition + termination without cause OR with good reason within 12 months)
- Repurchase rights at fair-market on departure pre-IPO (standard)
- Post-termination exercise window: 10 years (we don't squeeze former employees with 90-day windows)

### Salary review

- Annual review every 12 months from hire date
- Off-cycle adjustment if role scope changes materially
- Cost-of-living adjustment in line with the band, not negotiated

---

## Pre-offer mandatory steps

Before any offer goes out:

- [ ] Hiring manager (founder for first 5 hires) is decision-maker
- [ ] At least 3 internal interviewers if internal team exists; otherwise founder-only is fine
- [ ] 3 references checked, two of which are NOT from the candidate's submitted list (find via LinkedIn / mutual connections)
- [ ] Background check kicked off (third-party, post-offer-conditional)
- [ ] Offer letter drafted using the standard template (legal-reviewed once, then re-used)
- [ ] Compensation matches the band — if not, founder + advisor approval in writing
- [ ] Specific outcomes for first 90 days written in the offer
- [ ] Specific 12-month success criteria written in the offer

---

## Offer mechanics

- **Cash + equity numbers in writing.** No verbal-only.
- **Fairness explanation.** "Here's how we set the band, here's where you sit, here's why."
- **Open to questions for 48 hours.** Then we expect a verbal yes/no.
- **One round of negotiation.** Not three. We come close to our best on round one because that's how we'd want to be treated.
- **No exploding offers.** A 7-day window is fine; "respond by tomorrow" pressure tactics aren't.

---

## On-boarding (first 30 days)

- Day 0: Welcome packet, equipment, accounts, 1Password access (read-only initially)
- Day 1: 1:1 with founder + intro to the codebase / product / customers
- Day 1–7: Read CLAUDE.md, .claude/rules/, key architecture docs, recent post-mortems
- Day 8–14: First merged PR (engineering); first customer call shadowed (sales/CS); first internal Notion piece written (everyone)
- Day 15–30: First scoped project owned end-to-end
- Day 30: Written 30-day reflection from new hire AND from founder; calibrated against expectations

A 30-day misalignment is far cheaper to fix than a 90-day one. Force the conversation.

---

## Diversity and inclusion (in early hiring)

This is not a check-box section. The first 5 hires are who the next 50 want to work with.

- Sourcing pools must include candidates from groups underrepresented in fintech/treasury (specifically: women, Black engineers, candidates from outside US/UK home markets)
- Interview panels should be diverse on at least one axis from the second hire onward
- Salary bands are non-negotiable across candidates — same offer for same role regardless of demographics
- We track candidate-pool composition by stage; if pool diversity drops, we widen sourcing before hiring

This is not a separate program. It's how we run the funnel.

---

## What we don't do

- **Title inflation as compensation substitute.** Engineer doesn't become "Staff Engineer" because we can't pay $200k.
- **"You'll wear many hats" as a substitute for clarity.** Specific 90-day and 12-month outcomes per offer.
- **Hire to fix culture problems.** A new hire can't fix a founder-quality issue.
- **Hire from FAANG by default.** Different reasoning required.
- **Keep low performers because firing is hard.** First 6 months is the calibration window. After that, candor over comfort.

---

## Filing

- Job posts: `docs/internal/hiring/jobs/[role-slug].md` — not committed to public repo until live
- Interview kits: `docs/internal/hiring/kits/[role-slug].md`
- Reference questions: `docs/internal/hiring/reference-questions.md`
- Offer letter template: `docs/internal/hiring/offer-letter-template.md`
- Hiring tracker: Notion (or equivalent), restricted access

This kit is a living document. After every hire (or every miss), update with what we learned.
