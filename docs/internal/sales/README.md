# Sales Collateral — Index

**Generated:** 2026-04-25 · For: ORDR TreasuryFX commercial launch

This folder contains every artifact you need to take a treasurer, CFO, auditor, IT team, or investor from cold to closed-won. Use the files in roughly this order during a sales cycle.

---

## Files

| Stage | File | Use it when |
|---|---|---|
| **Strategy** | [`../go-to-market-analysis.md`](../go-to-market-analysis.md) | Reviewing positioning, pricing, competitive map, gap list |
| **Outbound** | [`outbound-templates.md`](outbound-templates.md) | Daily prospecting — 5 email sequences + LinkedIn + voicemail |
| **First meeting** | [`prospect-deck.md`](prospect-deck.md) | 15 slides, 30-min prospect demo |
| **First meeting** | [`roi-calculator.md`](roi-calculator.md) | Live ROI math during or after the discovery call |
| **Marketing site** | [`landing-page-copy.md`](landing-page-copy.md) | Build / update the home, pricing, security pages |
| **Procurement** | [`security-questionnaire.md`](security-questionnaire.md) | Answer SIG Lite / CAIQ / VSAQ / custom RFIs |
| **Procurement** | [`reference-architecture.md`](reference-architecture.md) | Send to IT / architecture review board |
| **Audit / IT** | [`auditor-deck.md`](auditor-deck.md) | 8-slide deck for Big 4 + internal audit + IT procurement |
| **Process** | [`sales-runbook.md`](sales-runbook.md) | Daily/weekly cadence, discovery script, objection handling, pricing guardrails |
| **Fundraising** | [`investor-deck.md`](investor-deck.md) | 12-slide deck for seed / Series A pitch meetings |

---

## Suggested first session (3–4 hours)

1. **Read** `../go-to-market-analysis.md` end-to-end (~30 min)
2. **Customize** the placeholders in `prospect-deck.md` with real contact info, real customer logos (or composite quotes), real screenshots
3. **Build** a Framer / Webflow site from `landing-page-copy.md` (~2 hours for a v1)
4. **Spin up** Calendly with two slot types (15-min intro, 30-min deep-dive)
5. **Generate** a list of 50 outbound prospects (use targeting filters in `outbound-templates.md`)
6. **Send** 5 outbound emails to your warmest targets to test the messaging

---

## Things only you can do (no AI / no contractor substitute)

These are the items that need a human decision or action — sequenced by leverage.

### This week
- [ ] **Pick the audience priority.** Decide whether the first 30 days are about prospects or investors. The decks differ; energy differs; calendar differs.
- [ ] **Register the domain.** `ordrtreasuryfx.com` (or chosen variant) + email aliases.
- [ ] **Rotate production secrets.** From the open-risks list — `docs/ops/secret-rotation-checklist.md`. Highest-leverage technical action.
- [ ] **Separate the demo tenant from prod.** `demo/demo` on the live URL is a sales liability if a prospect finds it.
- [ ] **Engage SOC 2 Type II auditor.** 6-month observation clock starts the day you sign. This is the long pole on enterprise procurement.
- [ ] **Buy cyber insurance.** $1M minimum. ~$3k/yr. Procurement gate at most enterprises.

### This month
- [ ] **Pick a tier anchor.** Lead Professional at $72k or start at Starter $24k? Recommendation: Professional.
- [ ] **Decide on legal/MSA.** Common Paper or Bonterms for MSA template; DPA already drafted.
- [ ] **Identify 3 design-partner candidates.** Warm intros only. Mid-market. Active hedge programs.
- [ ] **Big 4 partnership conversation.** One audit partner who knows treasury. Coffee, not pitch.
- [ ] **Trademark application.** "ORDR TreasuryFX" in target jurisdictions.
- [ ] **Status page provisioned.** `status.ordrtreasuryfx.com` (Better Uptime / Statuspage).

### This quarter
- [ ] **Annual third-party pen test.** Engage early; budget ~$15–25k.
- [ ] **First paid customer.** Or first paid design partner at reduced rate.
- [ ] **First case study published** (on the marketing site).
- [ ] **GTM hire #1** if pipeline supports it. Profile: ex-Reval / Kyriba / FXall AE.
- [ ] **Source code escrow agreement** (Iron Mountain / EscrowTech) for Enterprise tier.

---

## Things to update as you learn

- **Customer quotes** in `prospect-deck.md` Slides 2 and Customer Quote section → replace composites with real ones the moment you have permission
- **Logo wall** in `prospect-deck.md` and `landing-page-copy.md` Hero → add real logos as design partners sign
- **Traction numbers** in `investor-deck.md` Slide 6 → fill in once real
- **Pricing** across all files → keep in sync if you adjust tiers
- **Sub-processor list** in `security-questionnaire.md` Section J1 → maintain rigorously, 30-day customer notice required
- **Compliance dates** in `auditor-deck.md` Slide 5 → update as SOC 2 progresses

---

## Maintenance cadence

- **Weekly:** review pipeline, retire dead opportunities, update `questionnaire-log.md` (create when first questionnaire arrives)
- **Monthly:** sync all files for pricing / feature / compliance changes; export decks to PDF
- **Quarterly:** competitive deep-dive refresh (someone shipping AI-driven hedge optimization that changes our wedge?), pricing review (raising or holding?)
- **Annually:** rewrite the prospect deck. Sales decks rot. The story has to evolve.

---

## Questions or follow-ups?

The files above are first drafts — sharp where the data is sharp, generic where data hasn't been collected yet. Every `[bracketed placeholder]` is a deliberate prompt for you to fill in. Once you've filled them, this is a complete commercial-launch kit ready to ship.
