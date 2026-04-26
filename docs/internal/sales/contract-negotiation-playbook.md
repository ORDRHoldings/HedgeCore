# Contract Negotiation Playbook

**Audience:** Founder, future revenue lead, anyone who sits across from a procurement / legal team for ORDR
**Purpose:** Common redlines, our default position, our acceptable fallback, our walk-away. The playbook turns a 4-week negotiation into a 4-day one.

The MSA, DPA, and Order Form templates already represent our preferred starting position. This document is what we say when the customer pushes back.

---

## Principles

1. **Clarity over leverage.** A clean contract closes faster than a one-sided one. Long redline cycles cost more than the marginal gain from "winning" a clause.
2. **Don't over-promise.** Every clause we accept is one we have to operate against. If we can't operate it, we'll renegotiate later under worse leverage.
3. **Distinguish ask from must-have.** Most procurement asks are negotiable; a few are deal-breakers (their side or ours). Identify which is which on the first read.
4. **Founder approval for floor breaches.** Any clause that breaches the floor positions below requires a founder + advisor sign-off in writing.
5. **Speed beats discount.** A faster close at a lower discount frequently beats a higher-discount-with-slow-close, especially in our first 12 months.

---

## Clause-by-clause negotiation positions

For each common redline:
- **Default** = what's in our template
- **Acceptable** = what we'll accept after one round
- **Floor** = the worst we'll accept; below this requires founder + advisor approval
- **Walk away** = if customer demands worse than floor

---

### 1. Liability cap

| Position | Value |
|---|---|
| Default | 12 months of fees paid in the prior 12 months |
| Acceptable | 18 months of fees |
| Floor | 24 months of fees, **with** carve-outs (see below) preserved |
| Walk away | Uncapped liability for general claims |

**Carve-outs we always preserve:**
- Indemnity for IP infringement (separately capped at 2× fees)
- Confidentiality breach of Customer Data due to ORDR's gross negligence
- Death, bodily injury, fraud (uncapped — we cannot legally cap these in most jurisdictions)

**Carve-outs we resist:**
- "Uncapped data breach" — the cyber-insurance carrier will not cover this, so accepting it transfers an uninsurable risk to ORDR. Counter: super-cap of $5M or 3× fees, whichever is greater
- "Special, indirect, consequential" damages exclusion removed — never accept; this is the firewall against catastrophic losses

**Why this matters:** The single biggest financial risk in a SaaS contract. Uncapped liability for an early-stage company is existential.

---

### 2. Indemnity scope

| Position | Value |
|---|---|
| Default | IP infringement; mutual confidentiality |
| Acceptable | Add Personal Data Breach indemnity at sub-cap |
| Floor | Mutual indemnity for IP, confidentiality, and Personal Data Breach |
| Walk away | Indemnity for "any third-party claim arising from the service" — too broad |

**Stock language we add to scope creep:**

> "ORDR shall not be liable for claims arising from: (a) modification of the service by Customer; (b) Customer Data; (c) combination of the service with materials not provided by ORDR; or (d) Customer's failure to follow ORDR's published documentation."

This is standard SaaS protective language. Customers who push back hardest here usually have a hidden plan to misuse the platform.

---

### 3. Auto-renewal

| Position | Value |
|---|---|
| Default | Auto-renewal with 60-day non-renewal notice; price uplift capped at 7% per renewal |
| Acceptable | 90-day notice; uplift cap 5% |
| Floor | Auto-renewal removed; manual renewal required (we'll lose some renewals to pure inertia) |
| Walk away | "Customer may terminate at any time without cause" with full refund of unused term |

**Why customers push:** Procurement wants to avoid surprise renewals. They are right to push.

**Our counter:** "We commit to a 60-day reminder email and a 7% uplift cap. If you miss the renewal window, our default is to honor the prior price for an additional 30-day grace period."

---

### 4. Price increases

| Position | Value |
|---|---|
| Default | 7% cap on annual uplift |
| Acceptable | CPI + 3%, whichever is lower |
| Floor | CPI cap |
| Walk away | "Price fixed for entire multi-year term" without any escalator |

**Note:** A multi-year deal at flat pricing is fine if the year-1 number is locked at *higher* than current pricing. Don't trade flat-pricing for free; trade it for the year-1 number.

---

### 5. Service Level Agreement (SLA)

| Position | Value |
|---|---|
| Default (Enterprise) | 99.9% monthly uptime; 4-hour Sev-1 response 24/7 |
| Default (Professional) | 99.5% monthly uptime; 8-business-hour response |
| Acceptable | 99.95% Enterprise (tightens by 1 nine in availability) — only if customer has demonstrated they actually need it |
| Floor | 99.9% with service-credit cap of 30% of monthly fees |
| Walk away | Termination right after 1 missed SLA month |

**Service credits, not refunds.** This is the standard. The credit is applied to the *next* invoice. If customer pushes for cash refund, the answer is "we'll consider it for >2 consecutive missed months."

**Don't promise availability we can't measure.** If we don't have a status page with public history, don't sign 99.9%. Status page first.

---

### 6. Data residency / data localization

| Position | Value |
|---|---|
| Default | Customer chooses EU (Frankfurt) or US (us-east-1) at contract signing |
| Acceptable | Same — we already offer this |
| Floor | EU-only customer can request explicit "EU residency at all times" written commitment |
| Walk away | "Customer-specified country" residency outside EU/US — we don't operate in those regions yet |

**Specific scenarios:**
- UK customer post-Brexit: EU Frankfurt is acceptable; we add UK Addendum to DPA
- Swiss customer: EU Frankfurt + Swiss FADP modifications in DPA
- Australian customer: US us-east-1 + Australian Privacy Act DPA addendum
- Canadian customer: US us-east-1 + PIPEDA addendum
- Saudi / UAE / India customer: customer needs to be willing to accept US or EU residency. If not, we don't sell to them in v1

---

### 7. Customer audit rights

| Position | Value |
|---|---|
| Default | Annual SOC 2 Type II report + this trust center; on-site audit not granted |
| Acceptable | One on-site audit per year, 30-day notice, mutual scheduling, customer pays auditor; ORDR pays own staff time |
| Floor | One on-site audit per year, only after a documented incident or material change |
| Walk away | "Right to audit at any time without notice" — disrupts operations |

**Stock language:**

> "Customer may request an on-site audit not more than once per year, with 30 days' written notice. The audit shall be limited to controls relevant to ORDR's processing of Customer Data. Customer shall reimburse ORDR's reasonable costs of supporting the audit. SOC 2 Type II report and this trust center shall satisfy this requirement absent a material change."

---

### 8. Termination for convenience

| Position | Value |
|---|---|
| Default | Termination on 60-day notice; no refund of pre-paid term |
| Acceptable | Termination on 60-day notice; pro-rated refund for terminations >180 days into the term |
| Floor | Pro-rated refund as above; only enforceable on Enterprise tier |
| Walk away | "Customer may terminate at any time for any reason with full refund" — turns subscription into a month-to-month |

If customer absolutely needs the convenience of terminating early, we offer **a quarterly subscription** at higher per-month price — it solves the customer's commitment-fear problem without breaking our annual model.

---

### 9. Termination for cause

| Position | Value |
|---|---|
| Default | 30-day cure period; mutual |
| Acceptable | 30-day cure for general breaches; immediate termination for a Personal Data Breach exceeding [defined threshold] |
| Floor | Same as Acceptable |
| Walk away | "Immediate termination for any breach without cure" |

---

### 10. Data export and deletion on termination

| Position | Value |
|---|---|
| Default | 30 days post-termination to export; 90 days to deletion |
| Acceptable | 60 days export; 120 days to deletion |
| Floor | Same as Acceptable |
| Walk away | "ORDR must export within 7 days" — too short for an Enterprise migration |

**Hash-chain considerations:** Deletion of WORM data is irreversible and breaks the chain. The contract should say: "Deletion includes WORM audit data after the contractual retention period; Customer acknowledges that deletion of the WORM ledger is permanent and may impair future audit reconstruction."

---

### 11. Source code escrow

| Position | Value |
|---|---|
| Default | Not included by default |
| Acceptable | Included for Enterprise tier as a rider; agent: Iron Mountain or EscrowTech; release events as defined |
| Floor | Same as Acceptable |
| Walk away | Customer demands ongoing access to source under any condition other than a defined release event |

**Defined release events** (only these trigger release):
- ORDR's bankruptcy or formal wind-down notice
- ORDR's failure to provide service for >30 consecutive days
- ORDR's breach of a maintenance commitment after notice and cure

The **wind-down protection** in `business-continuity.md` is the precondition that makes escrow workable. Reference it in the rider.

---

### 12. SOC 2 Type II contingency

| Position | Value |
|---|---|
| Default (until Type II issued) | Buyer right to terminate without penalty if Type II not delivered by [agreed date] |
| Acceptable | Same |
| Floor | Same, with target date no earlier than Q4 2026 |
| Walk away | Customer demands Type II report at signing |

**Stock language for the Order Form Special Terms:**

> "Customer acknowledges that ORDR's SOC 2 Type II report is anticipated but not yet issued as of the date of this Order Form. ORDR commits to delivering the Type II report no later than [Date]. If the Type II report is not delivered by that date, Customer may terminate this Order Form without penalty within 30 days of the missed delivery date and receive a pro-rated refund of the unused subscription term."

---

### 13. Sub-processor restrictions

| Position | Value |
|---|---|
| Default | Public sub-processor list, 30-day change notice, customer right to object on reasonable grounds |
| Acceptable | Same |
| Floor | Same |
| Walk away | Customer demands "no sub-processors outside [their country]" — incompatible with our hosting model |

---

### 14. Insurance requirements

| Coverage | Default we carry | Customer often asks | Position |
|---|---|---|---|
| Cyber liability | $1M (early stage) | $5M | Move to $5M post-Series A or first Enterprise customer; meanwhile justify $1M with control posture |
| E&O / Tech E&O | $1M | $2–5M | Same path as cyber |
| General liability | $1M | $1–2M | Standard, $1M is fine |
| Employment practices | $0 (early stage) | $1M sometimes | Pass for now |

If a customer demands $5M cyber and we don't yet carry it, the answer is: "We commit to $5M cyber within 90 days of contract signing, contingent on the deal closing — this is a chicken-and-egg I'd be happy to walk through with you."

---

### 15. Right to use customer's name / case study / logo

| Position | Value |
|---|---|
| Default | "ORDR may identify Customer as a customer in marketing materials, including logo on website and reference list" |
| Acceptable | Logo only; no quote without separate written consent |
| Floor | "ORDR may not identify Customer publicly without written consent" |
| Walk away | (No walk-away — this is always negotiable) |

**Note:** Always trade logo rights for some other concession. Don't give it away free, even though we'd grant it free if we had to.

---

### 16. Force majeure scope

| Position | Value |
|---|---|
| Default | Standard force majeure (war, natural disaster, governmental action, pandemic) |
| Acceptable | Add cybersecurity events outside reasonable control as force majeure |
| Floor | Cybersecurity events explicitly excluded from force majeure (we can't claim breach is FM) |
| Walk away | "ORDR may invoke force majeure for any operational failure" — too broad |

---

### 17. Governing law / jurisdiction

| Position | Value |
|---|---|
| Default | Delaware (US-incorporated) or [equivalent home jurisdiction]; binding arbitration in [city] |
| Acceptable | Customer's jurisdiction if they are a Fortune-500 with leverage; arbitration |
| Floor | Mutually neutral jurisdiction (e.g., New York for US, London for UK, Frankfurt for EU) |
| Walk away | Customer's jurisdiction with court litigation (not arbitration) |

**Negotiation reality:** Big customers always win this clause. Don't fight on it past one round. Pick your battles.

---

## Negotiation tactics

### Opening

- Send the MSA + DPA + Order Form together. Don't drip-feed.
- Pre-disclose the SOC 2 Type II contingency and the sub-processor list with the first send.
- Ask: "What's your standard turnaround for software contracts under $200k?" Then commit to delivering inside that.

### Mid-negotiation

- Track changes in a markup; never accept blackline edits silently
- Every redline gets a one-line response: "Accepted," "Counter," or "Rejected, here's why"
- For "Counter" positions, propose alternative language in the same email — don't ping-pong

### When stuck

- Time-box: "If we can close on the remaining 3 items by Friday, we have a deal. Otherwise we should pause and revisit next quarter."
- Founder escalation: prospect's GC and our founder on a 30-min call. This breaks 80% of stalls.
- Pivot to scope: sometimes a pricing concession is easier than a contract concession (and vice versa)

### Walk-away

- Walk away is real. We'd rather lose a deal than sign a contract we can't operate.
- Document why. Walk-aways inform future template improvements.
- Stay polite — the customer who pushed too hard today might come back next year with a more reasonable team.

---

## Approvals

| Concession | Approver |
|---|---|
| Pricing within 20% of list | Founder alone |
| Pricing >20% off list | Founder + advisor in writing |
| Pricing below floor (Starter $20k / Professional $60k / Enterprise $130k) | Founder + advisor + documented justification |
| Liability cap above 12 months | Founder |
| Liability cap above 24 months OR uncapped carve-outs added | Founder + counsel |
| Force majeure language modification | Counsel |
| Governing law change to non-default | Counsel |
| Source code escrow with non-standard release events | Founder + counsel |
| Termination for convenience with refund | Founder |
| Auto-renewal removed | Founder |

When in doubt, ask. The cost of an extra 24-hour review cycle is far less than the cost of a clause we can't operate.

---

## Filing

Every executed contract is stored in:

- 1Password "Customer Contracts" vault (PDF)
- Notion "Customer Index" with metadata (term, ACV, residency, special terms)
- DocuSign / counter-signature service for the audit trail

Original templates live in `docs/legal/`. **Never edit the templates directly during a negotiation** — work in a `negotiations/[customer]/` working file and only update the master template after a round of three negotiations with consistent feedback.
