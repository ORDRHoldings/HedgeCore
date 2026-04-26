# Business Continuity & Disaster Recovery Plan

**Audience:** ORDR TreasuryFX leadership, ops, audit-pack reviewers
**Scope:** Continuity of service, restoration of service after a disaster, founder-key-person risk, vendor failures
**Companion:** `incident-response-plan.md` (shorter-horizon operational incidents)
**Review cadence:** Annually, and after any event that exercises the plan

---

## Definitions

- **RTO (Recovery Time Objective)** — maximum tolerable time from disaster to service restored
- **RPO (Recovery Point Objective)** — maximum tolerable data loss measured in time
- **Disaster** — an event that exceeds normal incident response capability, or that requires invoking external recovery resources

| Tier | Service | RTO | RPO |
|---|---|---|---|
| Critical | Authenticated API + ledger writes | 4 hours | 15 minutes |
| Critical | Audit Lab read-back + integrity verification | 4 hours | 0 (must be exact) |
| Important | Market data feed | 8 hours | 1 hour |
| Important | Reports Studio | 24 hours | 1 hour |
| Best-effort | Marketing site + landing pages | 48 hours | 24 hours |

These targets are commitments to ourselves and what we communicate to customers. The Enterprise SLA (99.9%) commits the *availability target* but the RTO/RPO above govern how we recover when the SLA is breached.

---

## Disaster scenarios

### Tier-A scenarios (covered by primary plan)

1. **Regional cloud outage** — Render or Vercel region down (e.g., us-east-1 unavailable for hours)
2. **Database loss** — Primary Postgres unrecoverable
3. **Code-base loss** — GitHub unavailable or org locked out
4. **Founder unavailability** — Single-key-person event for 5+ business days
5. **Sub-processor failure** — Critical sub-processor materially unavailable

### Tier-B scenarios (mitigated, not eliminated)

6. **Multi-region cloud outage** — entire AWS regional layer down for the chosen provider
7. **Supply-chain compromise** — npm/PyPI dependency turns malicious
8. **Cyber-insurance carrier dispute** during a real claim
9. **Long-running founder absence** (>30 days)
10. **Acquisition or wind-down** — orderly exit / continuity for customers

---

## Backups

### Database

- **Frequency:** Continuous WAL archiving + nightly base backup (Render Postgres native)
- **Retention:** 30 days rolling (Render Pro plan) + 90 days off-platform copy in cold storage
- **Off-platform copy:** Weekly `pg_dump` (compressed, GPG-encrypted) to a second cloud (default: a non-Render-hosted S3-compatible bucket)
- **Restore drill:** Quarterly. Restore the most-recent off-platform copy to a sandbox tenant; verify hash-chain integrity end-to-end.

The off-platform copy is the **non-negotiable** layer. Render dashboard snapshots are convenient but a single-vendor failure (account suspension, billing dispute, admin error) can lose them.

### Code base

- **Primary:** GitHub (`ORDR/hedgecore`)
- **Mirror 1:** Self-hosted Gitea instance with hourly mirror sync
- **Mirror 2:** Quarterly bare-clone tarball stored alongside DB backups in cold storage
- **Restore drill:** Annual. From the bare-clone, reconstruct a deployable repo and confirm `npx next build` + `pytest` succeed.

### Configuration & secrets

- Render env-var snapshot via `render env list --service hedgecore` exported quarterly to a 1Password "Production Secrets - Snapshot YYYY-QN" vault item, accessible to the founder and the designated business-continuity delegate (see Founder Key-Person section).

### Customer data exports

- Customers may request a full export of their tenant data at any time — JSON + per-table CSV, signed with the same hash chain. Documented in the DPA. **Build a one-click export tool by Q3 2026** if not already shipped — currently manual.

---

## Scenario response plans

### A1. Regional cloud outage (Render us-east-1 example)

**Detection:** UptimeRobot / Render status page / customer report.

**Immediate (T+0 → T+15 min):**
1. Confirm with Render status page (don't assume it's just us)
2. Status-page update: "Investigating — issue with upstream cloud provider"
3. Pull most recent off-platform DB backup metadata so we know we have an option

**Short-term (T+15 min → T+4 h, RTO horizon):**
1. If Render's outage estimate is <2 hours → wait it out, communicate every 30 min
2. If >2 hours or no estimate → spin up the standby in the alt region (Frankfurt) using the Render IaC template
3. Restore latest backup to standby
4. Update DNS via Vercel/Cloudflare to point API at standby
5. Validate hash-chain integrity post-restore (mandatory — never serve writes from an unverified chain)

**Recovery (post-event):**
1. Wait for Render primary to fully stabilize (24h soak period)
2. Resync any data written during standby period
3. Cut back over during a low-traffic window
4. Post-mortem within 5 business days

### A2. Database loss

The single hardest scenario. WORM tables and the hash chain depend on data integrity, not just data presence.

**Immediate:**
1. Stop all writes (toggle service to read-only via admin endpoint)
2. Determine: total loss, partial loss, or corruption?
3. Page founder + DBA-on-call

**Recovery:**
1. Identify last-known-good backup with verified hash chain
2. Restore to a fresh database
3. Recompute the hash chain end-to-end (`app/engine_v1/audit.py` recompute)
4. Diff against last-known head — if it matches a backup-recorded head, integrity is preserved
5. If gap exists between backup and outage moment, that becomes the data-loss window — disclose to affected customers per DPA
6. Bring service online in read-only first; full read-write only after a second engineer signs off on the chain verification

**Customer disclosure:**
- Any data loss within the RPO window (15 min) → status-page transparency
- Any data loss exceeding RPO → direct email to all affected customers within 24 hours, with the exact window and what to expect

### A3. Code-base loss (GitHub unavailable / org locked)

**Detection:** GitHub status page; failed CI runs; org access blocked.

**Mitigation already in place:** Mirrors (Gitea + cold-storage tarball).

**Recovery:**
1. Push from local laptop or the Gitea mirror to a new GitHub org if needed (`ORDR-bc/hedgecore`)
2. Update CI/CD to point at the new origin
3. If GitHub is just slow / partial, wait — don't fork unnecessarily

### A4. Founder key-person event

**Definition:** Founder unavailable for 5+ business days due to incapacity, family emergency, or other.

**Pre-positioned controls:**

- [ ] **Business-continuity delegate** — a named individual (initially: the lead engineer or co-founder, otherwise: ORDR's lead advisor) with sealed access to a "BC envelope" containing:
  - 1Password emergency-kit recovery code
  - Render account recovery procedure (with Render support contact)
  - GitHub org admin recovery contact
  - Domain registrar account recovery
  - Banking access recovery procedure
  - Cyber-insurance carrier contact
  - Outside counsel contact
- [ ] **Founder will / instructions** — separate from BC envelope, held by counsel. Specifies: who decides on long-term continuation, sale, or wind-down.
- [ ] **Customer-facing language** drafted in advance: "We are continuing service while [founder] is unavailable. [Delegate] is your point of contact." (Don't say more than this without counsel.)

**On invocation:**
1. Delegate reviews BC envelope with counsel before opening anything
2. Customer-facing message goes out within 48 hours of invocation
3. Critical operations (deploys, secret rotation) run on a 4-eyes basis with delegate + lead engineer
4. No major decisions (acquisition discussions, contract changes, major commitments) are made in the first 30 days unless explicitly authorized by founder's pre-positioned instructions

**De-escalation:** Founder returns → BC envelope is **resealed** (not destroyed — keep the access trail), debrief with delegate within 7 days.

### A5. Sub-processor failure

**Most-impacting sub-processors:**
- Render (hosting) — see A1
- Vercel — see A1 (frontend equivalent)
- Stripe — billing only, customers unaffected operationally
- TwelveData — market data degrades, fail-open

**Fallback:**
- Frontend hosting: Cloudflare Pages standby template can be deployed in <2 hours if Vercel is unrecoverable
- Market data: secondary feed integrated but not enabled by default; manual env-var swap activates it
- Stripe: collections continue manually for 30 days; no operational impact on the platform

### A6 (Tier-B). Multi-region cloud outage

Above the realistic mitigation envelope of an early-stage company. Plan: ride out the outage, communicate every 30 minutes, restore from off-platform backups to a different cloud provider if the outage exceeds 24 hours.

A real defense for this requires multi-cloud active-active, which is not in v1 scope. Do not promise it. **Disclose this honestly in the DPA Annex II** ("we operate single-cloud per region").

### A7 (Tier-B). Supply-chain compromise

Mitigations:
- `pip-audit` and `npm audit` on every PR
- Dependabot enabled
- No auto-merge on dependency updates — every dependency update is reviewed
- Lockfile-only installs (`pip install --require-hashes`, `npm ci`)
- Dependency pinning enforced

Response if a dependency is compromised:
1. Pin to known-good prior version, deploy
2. Force secret rotation if the dep had access to secrets at runtime (rare but possible)
3. Audit log review for unusual writes
4. Notify customers if Customer Data could have been touched

### A10 (Tier-B). Wind-down / orderly exit

If ORDR were to wind down, customers must be able to continue operating their treasury function. The plan:

1. **180-day notice** to all customers
2. **Source-code escrow release** is triggered (Enterprise tier customers with the escrow rider)
3. **Full data export** to each customer (JSON + CSV + hash-chain proofs)
4. **Continuity partner** — a partner agreement with a TMS vendor or open-source maintainer steward who can host customer data for migration assistance for 6–12 months
5. **Refund schedule** — pro-rated unused subscription period
6. **Sub-processor terminations** — all customer data is purged from sub-processors with attestation

Pre-position the partnership conversations (item 4) by Q4 2026; revisit annually. This is what makes the platform safe for an institution to bet on.

---

## Drills

| Drill | Frequency | Owner |
|---|---|---|
| DB restore from off-platform backup → sandbox tenant → hash-chain verify | Quarterly | Lead engineer |
| Code-base reconstruction from cold-storage tarball | Annually | Lead engineer |
| Founder-key-person tabletop with delegate + counsel | Annually | Founder |
| Status-page + customer-comms drill | Quarterly | CS lead |
| Standby region cutover dry-run | Annually | Lead engineer |
| Wind-down scenario tabletop | Every 18 months | Founder + counsel |

Drill outcomes are recorded in `.claude/state/bc-drill-log.md`. A failed drill is itself a Sev-2 incident — it gets a post-mortem and action items.

---

## Customer commitments

This document drives what we are willing to put on paper:

| In MSA / DPA | Commitment |
|---|---|
| Yes | RTO 4h critical / RPO 15min critical |
| Yes | Annual restore-drill attestation available on request |
| Yes | Off-platform backup of customer data |
| Yes | Source-code escrow for Enterprise tier (rider) |
| Yes | 180-day wind-down notice |
| Yes | Customer data export on request (one-click target Q3 2026) |
| No | Multi-region active-active (out of v1 scope) |
| No | RTO < 1 hour (not realistic at our stage; would mislead) |
| No | Specific dollar-value continuity guarantees beyond MSA liability cap |

Honesty about what is and isn't covered is a feature, not a weakness. Auditors and procurement know the difference between a real plan and a plan written to win an RFP.

---

## Document control

- **Owner:** Founder (until BC delegate is formally named in writing)
- **Reviewers:** Lead engineer, CS lead, outside counsel
- **Storage:** This document is checked into the repo and mirrored to the BC envelope
- **Distribution:** All employees on day one; customers on request (sanitized); auditors as part of the SOC 2 evidence pack
