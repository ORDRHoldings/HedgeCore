# Customer Onboarding Playbook — 90 Days

**Audience:** ORDR TreasuryFX customer success / implementation lead
**Scope:** First paying customer through "first live hedge in production." Default plan is 90 days for Professional, 120 for Enterprise. Starter is self-serve and does not consume this playbook.

---

## North-star outcomes

By Day 90 the Customer is:

1. **Live in production** — at least one hedge has been calculated, approved, executed (or staged for execution), and recorded to the immutable ledger.
2. **Self-sufficient on the daily workflow** — Treasurer can run a hedge cycle without ORDR support.
3. **Audit-evidence-ready** — Customer has produced their first quarterly audit pack from the platform.
4. **A reference, or on the path to becoming one** — willing to take a reference call, or with a clear path to that consent.

If any of those four are missing on Day 90, do not declare the onboarding closed. Run a 30-day extension and document the gap in the renewal-risk log.

---

## Roles

| Role | Who | Responsibility |
|---|---|---|
| Implementation Lead (ORDR) | Founder during early customers; CS lead later | Owns Customer happiness end-to-end; primary contact |
| Treasury Lead (Customer) | Treasurer or senior treasury analyst | Owns workflow design, policy authoring, sign-offs |
| IT/Security Sponsor (Customer) | CISO delegate or head of IT | Owns access provisioning, SSO, network |
| Finance/Audit Sponsor (Customer) | Controller or head of accounting | Owns hedge accounting policy, audit-pack approval |
| Executive Sponsor (Customer) | CFO or VP Finance | Owns the relationship, escalation, renewal decision |

Identify all five names in writing during Week 0. If any role is unfilled, flag it as the top onboarding risk.

---

## Phase map

```
Week 0:    Pre-kickoff — contracts, access, data inventory
Weeks 1–2: Foundation — environment provisioning, SSO, policy import
Weeks 3–4: Configuration — risk taxonomy mapping, instrument approval, sandbox calculation
Weeks 5–6: Validation — staging mirror, parallel run vs. spreadsheet, audit dry-run
Weeks 7–8: Approval pipeline — 4-eyes maker/checker live in staging, training
Weeks 9–10: Production cutover — first live hedge executes through ledger
Weeks 11–12: Stabilization — second cycle independent, quarterly audit pack produced, handoff to renewal owner
```

---

## Week 0 — Pre-kickoff (before contract signature ink dries)

**Goals:** No surprises on Week 1.

- [ ] Counter-signed Order Form + MSA filed; counter-signature date noted in CRM
- [ ] Kickoff invite sent (60 minutes, all five roles, within 5 business days of signing)
- [ ] Welcome email (template `M1` in `outbound-templates.md`) with: implementation lead bio, what to expect, the data inventory request, the security-questionnaire fast-track if needed
- [ ] Customer security questionnaire response delivered, even if not requested (proactive)
- [ ] Sub-processor list delivered with the Customer's region pre-noted
- [ ] Shared Slack Connect channel or Teams equivalent created (default: Slack Connect)
- [ ] Internal Notion/Linear project created with the 12-week milestones
- [ ] Risk register opened with these starter rows: SSO blocker, data-residency blocker, hedge-accounting policy not yet documented, no IT sponsor identified
- [ ] Implementation Lead has read the Customer's most recent 10-K/annual-report treasury section (public companies) or the Customer's own hedge policy (private)

**Red flag:** Customer does not respond to the welcome email within 3 business days. Escalate to the executive sponsor before Day 5.

---

## Weeks 1–2 — Foundation

**Goals:** Customer has access. Customer's data is structured. Customer's policy is captured in writing.

### Week 1

**Day 1 (Kickoff)**

Run a 60-minute kickoff with this agenda:

| Min | Topic | Owner |
|---|---|---|
| 0–5 | Introductions, role confirmation | All |
| 5–15 | The 90-day plan + milestones (this playbook) | ORDR |
| 15–30 | Data inventory walkthrough — what we need and why | ORDR |
| 30–45 | Hedge-policy draft walkthrough — Customer presents their current policy | Customer |
| 45–55 | Risk register and known blockers | All |
| 55–60 | Action items + Day 7 checkpoint | ORDR |

Send the recap with action items within 4 hours. Recap email always lists who owns what by when.

**Day 2–4: Provisioning**

- [ ] Tenant provisioned in the Customer's data residency region (EU Frankfurt or US us-east-1)
- [ ] Sandbox environment URL delivered: `https://[customer]-sandbox.ordrtreasuryfx.com`
- [ ] First admin user invited (password set by Customer, never by ORDR)
- [ ] SSO discovery call scheduled if Customer has SAML/OIDC

**Day 5 (End of Week 1 checkpoint)**

15-minute sync. Check three things:
1. Does Customer have access?
2. Is the data inventory request unblocked?
3. Are the five roles filled?

If any answer is "no," that becomes the Week 2 priority.

### Week 2

**Goals:** SSO live, policy captured.

- [ ] SSO configured — SAML metadata exchanged; first SSO login confirmed end-to-end
- [ ] User roles drafted — Treasurer, Approver, Accountant, Auditor (read-only), Admin
- [ ] Audit account provisioned (read-only — give to internal audit before they ask)
- [ ] First **draft** of hedge policy uploaded to the platform (does not need to be final)
- [ ] Risk taxonomy R1–R8 mapping started — which of the 8 risk types apply to this Customer
- [ ] Cash-position data source identified — ERP / bank file / treasury workstation export
- [ ] First exposure data point loaded into sandbox (one currency pair, one entity is enough)

**Deliverable to Customer (end of Week 2):** A one-page "Foundation Confirmation" doc summarizing tenant URL, residency region, SSO posture, user list, hedge policy v0, and the next 8 weeks. Get it signed (email "looks good" is fine — file it).

---

## Weeks 3–4 — Configuration

**Goals:** Customer can compute a hedge in the sandbox that matches a known reference number from their current process.

### Week 3

- [ ] R1–R8 risk taxonomy fully mapped to Customer's exposures (write down the mapping)
- [ ] Approved instruments list configured — typically: spot, forward, NDF, FX swap. (Options only if the Customer trades them today; never sell options usage in onboarding.)
- [ ] Counterparty list imported (banks the Customer has ISDA/CSA with)
- [ ] Hedge accounting policy choice confirmed — IFRS 9 cash-flow / fair-value / net-investment, or ASC 815 equivalent. Document which.
- [ ] Effectiveness method chosen — typically critical-terms-match for forwards; regression for non-trivial cases
- [ ] First sandbox calculation run — produces a hedge ratio + a forward quote

**Deliverable:** Side-by-side of ORDR's calculated hedge vs. Customer's existing spreadsheet on the same exposure. Track variance. Discuss any difference with the Customer's accountant before moving on.

### Week 4

- [ ] Variance reconciled — either the spreadsheet had a hidden assumption (common) or ORDR has a config gap (rare). Document the reconciliation.
- [ ] Audit Lab module walked through with Customer — they see the WORM event stream and the hash chain in action
- [ ] Tri-state pipeline explained — what Sandbox / Staging / Ledger means for them operationally
- [ ] First "what does an auditor see?" walk-through with the Finance/Audit sponsor — show them the audit-pack export

**Red flag:** End of Week 4 and the variance is unresolved or "we'll come back to it." Stop the clock. Variance must be resolved before any production traffic.

---

## Weeks 5–6 — Validation

**Goals:** Run the platform in **staging** in parallel with whatever the Customer does today, for at least 10 business days.

- [ ] Staging environment provisioned — same shape as production but no live execution
- [ ] Daily exposure feed automated (file drop, ERP connector, or API) — manual entry should NOT be the production plan
- [ ] 10-day parallel run begins:
  - Customer runs their current process as usual
  - ORDR runs the same exposures through staging
  - Daily 5-minute Slack check: any divergence?
- [ ] Effectiveness testing dry-run on real Q–1 data — does the platform produce numbers the auditor would accept?
- [ ] Bank confirmation flow tested in staging (MT103 generation, but not transmitted)

**Exit criterion:** Customer's Treasurer can describe, on a 10-minute call without ORDR's help, what the platform did each day for the past two weeks.

---

## Weeks 7–8 — Approval pipeline & training

**Goals:** Maker/checker workflow operates with real users. Training delivered.

- [ ] 4-eyes pipeline configured — Treasurer is maker, Controller is checker (or whatever the Customer's SoD model says — get it in writing)
- [ ] First proposal made and approved entirely in staging by Customer staff (not by ORDR)
- [ ] Separation-of-duties enforcement tested (same user cannot make and check)
- [ ] Reports Studio walk-through — Customer builds their first report (P&L by hedge, effectiveness summary, ledger excerpt)
- [ ] Training sessions delivered (record them for replay):
  - Session 1 (60 min): Treasurer daily workflow
  - Session 2 (45 min): Approver daily workflow
  - Session 3 (45 min): Accountant month-end workflow
  - Session 4 (30 min): Auditor read-only walkthrough
- [ ] Customer's runbook drafted — a 1-page "what to do every day" from Customer perspective. Customer writes this; ORDR reviews.

**Deliverable:** Recorded training library accessible to all Customer users.

---

## Weeks 9–10 — Production cutover

**Goals:** First **live** hedge moves through the pipeline and is committed to the immutable ledger.

### Pre-cutover checklist (must all be ✓)

- [ ] All variance resolved
- [ ] All five roles still filled and engaged
- [ ] Customer has run staging independently for at least 5 consecutive business days without ORDR intervention
- [ ] Audit Lab integrity check passes (hash chain verification command run)
- [ ] Customer's IT sponsor has confirmed network/firewall ready
- [ ] Bank confirmation channel tested end-to-end with the Customer's bank (one test message delivered and acknowledged)
- [ ] Rollback plan written — what does Customer do if ORDR is unavailable on cutover day? (Answer: continue current process; ORDR is additive, not replacing critical bank channels.)

### Cutover day

- 09:00 — Pre-flight call (15 min) with all five roles
- 09:30 — Customer creates the day's exposure proposal in production
- 10:00 — Approver approves, proposal moves to staging
- 10:30 — Customer pushes to ledger; ORDR observes, does not touch
- 11:00 — Confirmation that hash chain advanced cleanly
- 14:00 — Debrief, what surprised you? Document everything.

**The implementation lead does not type into the Customer's production tenant. Ever. This is non-negotiable for audit posture.**

---

## Weeks 11–12 — Stabilization

**Goals:** Second cycle is independent. First quarterly audit pack produced. Renewal owner takes over.

- [ ] Second hedge cycle run end-to-end without ORDR being on a call
- [ ] Quarterly audit pack generated and reviewed with Customer's auditor (or internal audit if external auditor is not yet engaged)
- [ ] Health check: success metrics collected
  - Time from exposure to approved hedge (target: <30 minutes)
  - Audit-evidence retrieval time (target: <5 minutes)
  - Number of ORDR support tickets in Week 11–12 (target: <3)
- [ ] Renewal-risk score assigned: Green / Yellow / Red, with rationale
- [ ] Renewal owner introduced (in early customers: founder stays on; later: dedicated CSM)
- [ ] Reference-call consent asked — even if "not yet," document the path

**Final deliverable:** A 2-page Onboarding Closeout doc with: outcomes vs. plan, success metrics, open issues, renewal-risk score, reference path. Signed by Implementation Lead and Customer Executive Sponsor.

---

## Cadence after onboarding

| Cadence | Owner | Purpose |
|---|---|---|
| Daily Slack Connect | Treasurer ↔ CSM | Tactical questions, <24h response SLA |
| Weekly 30-min check-in (first 90 days post-go-live) | CSM + Treasurer | Trend issues, surface friction |
| Monthly 60-min business review | CSM + Sponsor | Outcomes, expansion paths, blockers |
| Quarterly Executive Business Review | CSM + Founder + CFO | Strategic, renewal-relevant |

---

## Anti-patterns (don't do these)

1. **Customizing the engine for one customer.** v1 architecture is frozen. If the Customer needs a behavioral exception, that's a config or a documented limitation, never a code branch.
2. **Logging into the Customer's production tenant.** Audit-poisoning. Use sandbox, training environment, or screen-share — never type production.
3. **Promising the moon to close the deal, then making CS clean it up.** Sales hand-off must include every promise made; if it wasn't in the Order Form's "Special Terms" section, it's not committed.
4. **Skipping the parallel-run validation.** "Customer is in a hurry" is the most common reason go-lives fail. The parallel run is non-negotiable.
5. **Treating SSO as IT's problem.** SSO blockers eat 40% of onboarding time. Push it into Week 1.
6. **Letting the policy stay in the Customer's head.** If the hedge policy isn't written down by Week 4, the project is at high risk; escalate to executive sponsor.
7. **Marking the project "done" because Day 90 arrived.** Done = the four north-star outcomes. Time-boxed projects with unmet outcomes become churn.

---

## Templates

- Kickoff invite: `outbound-templates.md` template `O1`
- Welcome email: `outbound-templates.md` template `M1`
- Weekly recap: 5 sections — Done / In progress / Blocked / Decisions needed / Next week
- Risk register: 1-line entries — `[date] [severity] [description] [owner] [target close]`
- Closeout doc: 2 pages — outcomes, metrics, open issues, renewal-risk, references
