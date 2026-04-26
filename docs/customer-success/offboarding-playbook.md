# Customer Off-boarding Playbook

**Audience:** ORDR CS, the founder, anyone running a customer's planned exit
**Purpose:** Run a clean, dignified off-boarding that protects the customer's audit posture, our reputation, and our contractual obligations — even (especially) when the customer is unhappy

A bad onboarding loses a customer. A bad off-boarding costs you the next three through reputation. Off-boarding well is a sales asset.

---

## When this playbook fires

- **Planned non-renewal** (customer chose not to renew at the end of a term)
- **Termination for convenience** (per MSA, where applicable)
- **Termination for cause** (either side)
- **Customer acquisition** (their company was acquired and the acquirer uses a different platform)
- **Wind-down on our side** (covered in `business-continuity.md` Section A10)

This playbook does **not** cover suspending an account for non-payment — that's a separate, shorter process.

---

## Principles

1. **The customer keeps their data.** Always. No exceptions, no negotiation. Their data is theirs.
2. **The audit posture survives the exit.** A customer who leaves must be able to answer auditor questions about their ORDR period for the next 7 years. The audit pack is the bridge.
3. **No surprises on the bill.** Final invoices are calculated transparently and shared in writing before issuance.
4. **The exit interview is mandatory.** Even if the customer is unhappy. Especially then.
5. **No badmouthing.** Not the customer to the team, not us to other customers. Even when it's tempting.

---

## Phase map

```
Day -90 to -60:  Renewal-at-risk signals identified
Day -60 to -30:  Save attempt OR exit-prep alignment
Day -30:         Exit decision confirmed in writing
Day -30 to 0:    Hand-off planning, audit pack export, data handoff
Day 0:           Subscription ends
Day +30:         Service access ends; final invoice settled; audit pack delivered
Day +30 to +90:  Data deletion countdown
Day +90:         Operational data deleted; WORM data retained per regulatory minimum
Day +90 to year 7: WORM ledger retained; available on request for audit reconstruction
```

---

## Phase 1: Renewal-at-risk (Day -90 to -60)

If a customer's renewal is at risk, **the founder owns the conversation**. Not CS. Not sales. The founder.

- [ ] Pull up the customer's full timeline — onboarding, support tickets, last 6 months of usage, last QBR
- [ ] Direct call (not email) with the buyer — "I want to understand where things stand"
- [ ] Listen — real listening, not selling. The first call is for understanding only
- [ ] Within 48 hours of the call, send a written summary of what you heard back to the customer
- [ ] Decide: save attempt or exit-prep alignment? If save attempt, see `sales-runbook.md` Section "Save plays". If exit-prep, proceed to Phase 2.

**Don't:**
- Discount in panic. A discount applied at this stage rarely changes a real-decision exit
- Sell new features at this stage. The customer is past selling
- Make the call about us. It's about them

---

## Phase 2: Exit-prep alignment (Day -60 to -30)

Once exit is the path:

- [ ] Confirm the exit decision in writing (email is fine; doesn't need a formal letter)
- [ ] Set the exit date in the customer's calendar and in ours — usually the end of the current term
- [ ] Identify the customer's exit owner — the person on their side managing the transition
- [ ] Identify their post-exit destination — Excel? Another vendor? Internal build? This shapes the data-export format
- [ ] Clarify obligations both ways: their final payment, our final deliverables, transition support
- [ ] Reaffirm the data-export and deletion commitments in the DPA

**Send the exit-prep email**:

```
Subject: Exit prep for [Customer] — confirming our plan

[Name],

Thanks for the conversation. To make sure nothing is lost in handover, here's
what I have written down:

- Subscription end date: [Date]
- Service access cutoff: [Date + 30 days post-end]
- Audit pack export: I'll deliver final pack [Date]
- Final invoice: [Amount + breakdown], payable [Date]
- Data deletion of operational data: [Date + 90 days post-end]
- WORM audit data: retained per regulatory retention period (7 years), accessible
  by you on written request

Please reply to confirm or correct any of the above.

The goal is for your audit posture for the period you used ORDR to be intact 5
years from now without any input from us. The audit pack is what makes that
true.

— [Founder]
```

This single email saves 90% of the post-exit confusion.

---

## Phase 3: Hand-off planning (Day -30 to 0)

### Audit pack export

- [ ] Generate the **final audit pack** for the entire customer-relationship period (not just the most recent quarter)
- [ ] Verify the chain integrity end-to-end before delivery
- [ ] Deliver to the customer's designated contact via secure transfer (1Password share or equivalent)
- [ ] Include the [auditor evidence walkthrough](../internal/sales/auditor-evidence-walkthrough.md) document so future auditors can interpret the pack without our help

### Data export

- [ ] Generate the **comprehensive data export**:
  - JSON exports of every entity (positions, hedges, policies, users, audit events)
  - CSV exports for human reading
  - PDF copies of every signed policy revision and audit memo
  - All bank-message records (MT103 / pain.001)
- [ ] Confirm export format with customer in advance — some have a specific format their next system needs
- [ ] Encrypt the export with a password the customer chooses; share the password through a different channel than the export
- [ ] Deliver via the same secure transfer as the audit pack

### User offboarding

- [ ] Schedule a **30-minute hand-off call** with the customer's exit owner and treasurer
- [ ] On the call: walk through the audit pack, the data export, and where each artifact will live in their environment going forward
- [ ] Confirm any users they want disabled before the cutoff
- [ ] Confirm any users they want extended for read-only access through the cutoff window

### Final invoice

- [ ] Calculate any pro-rated refund (if applicable — see MSA termination terms)
- [ ] Calculate any outstanding amount owed
- [ ] Send invoice with the line-item breakdown clearly visible
- [ ] CC the customer's AP contact on the invoice
- [ ] Confirm receipt before the cutoff date

### Insurance / contractual cleanup

- [ ] Confirm any indemnity tail provisions remain in effect per MSA Section [N]
- [ ] Confirm liability cap calculations finalized for the trailing 12-month period
- [ ] Confirm sub-processor data-processing notifications are no longer required
- [ ] Update internal CRM and Notion to "Off-boarded" status

---

## Phase 4: Cutoff (Day 0)

- [ ] At the agreed time, disable the customer's tenant from active use (read-only mode)
- [ ] Send the off-boarding-complete email
- [ ] Schedule the exit interview for Day +14

The cutoff itself is anticlimactic if the prep was done. That's the goal.

---

## Phase 5: Service access end (Day +30)

- [ ] At Day +30 from end of subscription, **service access ends**
- [ ] Final reminder email at Day +25 — "your service access ends in 5 days; if you need anything else from the platform UI, do it now"
- [ ] At Day +30, customer accounts are disabled
- [ ] The audit pack and data export remain available — they were already delivered

---

## Phase 6: Data deletion (Day +90)

- [ ] At Day +90 from end of subscription, **operational data is deleted**:
  - User accounts (already disabled at Day +30)
  - Sentry / log retention scrubbed for this tenant
  - Operational caches purged
  - Customer's branding / configuration removed
- [ ] Send a **deletion attestation** to the customer:

```
Subject: Data deletion attestation — [Customer]

[Name],

Per our agreement, operational data for your tenant has been deleted as of
[Date]. The following has been removed:

- User accounts and authentication credentials
- Operational logs and error reports
- Cached data
- Configuration and customization

The following has been retained per the contractual retention period (7 years
from the original creation date of each record):

- WORM audit ledger (audit_events, calculation_runs, policy_revisions,
  ledger_entries) — retained for audit reconstruction purposes per IFRS 9 /
  ASC 815 retention norms and our DPA

If at any time during the retention period you need access to the WORM ledger
for an audit reconstruction, please email dpo@ordrtreasuryfx.com and we will
respond within 10 business days.

Thank you for being a customer. We genuinely wish you well in what's next.

— [Founder]
```

The attestation is itself a record we keep. File it in 1Password "Customer Off-boardings" vault.

---

## Phase 7: WORM retention (Day +90 to year 7+)

- WORM data remains in our database
- Customer can request audit reconstruction at any time during the retention period
- After 7 years (or longer if applicable regulatory minimum is longer), WORM data is deleted with a final attestation

This is the part that buys customer confidence in ORDR for the duration of *their* obligations to their auditors and regulators, not just ours.

---

## The exit interview

Run this even when the customer was unhappy. Especially then.

**Time:** 30 minutes
**Owner:** Founder for first 50 customers; CS lead thereafter
**Format:** Same as [win-loss interview template](../internal/sales/win-loss-interview-template.md), with these additional questions:

1. "What did we do well during the relationship?"
2. "What was the breaking point — was it one specific thing or a pattern?"
3. "Looking back at the original sales conversation, what should we have known then that would have changed the outcome?"
4. "If you could change one thing about how we handled the off-boarding itself, what would it be?"
5. "Would you take a reference call from a future prospect about your experience — including the ending?"

Yes, ask question 5. Many off-boarded customers will do this. Their honest "we left for X reason" reference call is more credible than any happy reference because it pre-empts the concern in the new prospect's mind.

---

## Common scenarios and how we handle them

### Customer is unhappy because of a specific issue we caused

- Acknowledge specifically. "You're right that the [issue] in [month] cost you time and trust. We understand."
- Offer something concrete: a refund of one month, an extension of audit-pack support, an apology in writing
- Don't argue the facts even if you disagree — the relationship is over and the customer is your future case study or reference, positively or negatively

### Customer is leaving for a competitor

- Don't badmouth the competitor
- Don't try to win the deal back beyond Phase 1's save attempt
- Make the off-boarding so smooth that the customer notices, and tells the competitor about it

### Customer was acquired and the acquirer uses a different platform

- Often a fast off-boarding — sometimes 30 days
- Be flexible on dates; the customer is dealing with a much larger life event
- Offer to talk to the acquirer's treasury team if that helps the integration — sometimes the acquirer becomes a future customer

### Customer is shutting down (not acquisition; actually winding down)

- Follow the standard playbook
- Be human. The customer's team is being laid off; treat them with care
- Final invoice may need flexibility — consult founder on case-by-case basis
- Offer the team members LinkedIn introductions or a reference if they're job-hunting

### Customer can't afford the renewal

- Phase 1 conversation surfaces this; consider a downgrade to Starter rather than full exit
- If exit is the path: clean off-boarding, gracious tone
- Some of these customers come back after a fundraise

### Customer terminates for cause (we breached)

- Counsel involvement immediately
- Off-boarding follows the playbook; legal handles the cause-of-termination negotiation in parallel
- Liability and indemnity calculations take precedence over speed

---

## Anti-patterns

- **"We'll keep your account active for free for a few extra months."** No. The contract says what it says. Generosity in the future creates ambiguity in the present.
- **"Let me get the founder on the phone to convince you to stay."** Phase 1 is the time for that. Past Phase 1, it disrespects the customer's decision.
- **"Don't worry, we'll handle the audit pack later."** Send it before the cutoff date. Always.
- **Cutting off access before Day +30.** Violates the contract. Don't do it.
- **Discussing the off-boarded customer with other customers.** Ever. Not even in vague terms. Privacy of the relationship survives the relationship.

---

## Filing

For every off-boarded customer:

- [ ] Off-boarding folder in 1Password "Customer Off-boardings" vault
- [ ] Final audit pack delivered (record of delivery)
- [ ] Data export delivered (record of delivery)
- [ ] Deletion attestation sent (Day +90)
- [ ] Exit interview notes
- [ ] Off-boarding-complete tag in CRM
- [ ] Aggregate review entry per [win-loss interview template](../internal/sales/win-loss-interview-template.md)
