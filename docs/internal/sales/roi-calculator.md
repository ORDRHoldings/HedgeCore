# ORDR TreasuryFX — ROI Calculator

**Purpose:** Defensible, conservative ROI math you can show a treasurer or CFO. Three worked examples. Spreadsheet-ready formulas at the end.

**Stance:** Always present a **payback period** (not just savings). CFOs reason in payback months. If your payback is < 12 months, the deal closes itself.

---

## The four savings drivers

ORDR replaces or compresses four ongoing treasury costs:

1. **Hedge accounting labor** — quarterly IFRS 9 / ASC 815 effectiveness testing in Excel
2. **Audit fee inflation** — additional audit hours required when hedge documentation is weak
3. **Regulatory penalty risk** — EMIR / MiFID II late or missing submissions
4. **FX spread leakage** — sub-optimal counterparty selection without TCA

Plus one optional driver:

5. **Headcount avoidance** — replacing a planned analyst hire

---

## Calculator inputs

| Input | Description | Typical mid-market value |
|---|---|---|
| `notional_hedged` | Annual FX notional hedged ($) | $50M – $500M |
| `treasury_fte_count` | Number of treasury staff | 2 – 8 |
| `treasury_fully_loaded_cost` | Fully-loaded annual cost per FTE ($) | $120k – $200k |
| `pct_time_on_hedge_accounting` | % of treasury time on hedge accounting + reconciliation | 15% – 35% |
| `audit_fee_annual` | Total annual external audit fee ($) | $200k – $1.5M |
| `pct_audit_fee_treasury_complexity` | % of audit fee driven by treasury complexity | 5% – 15% |
| `regulatory_submissions_per_year` | Number of EMIR / MiFID submissions per year | 50 – 5,000 |
| `risk_pct_late_submission` | Probability any given submission is late | 0.5% – 5% |
| `expected_penalty_per_incident` | Expected penalty if late ($) | $5k – $80k |
| `bank_count_for_fx` | Number of banks executing FX | 2 – 8 |
| `avg_fx_spread_bps` | Current average FX spread (basis points) | 5 – 25 bps |
| `tca_spread_improvement_bps` | Conservative spread improvement from TCA + counterparty scoring | 1 – 5 bps |

---

## Savings formulas

### S1 — Hedge accounting labor savings
```
hedge_accounting_hours_recovered = treasury_fte_count
                                  × treasury_fully_loaded_cost
                                  × pct_time_on_hedge_accounting
                                  × ORDR_efficiency_factor
```
Where `ORDR_efficiency_factor = 0.6` (we conservatively claim ORDR recovers 60% of the time spent — quarterly close cycle, designation paperwork, journal entry prep). The other 40% remains policy decisions, exception handling, and sign-offs that ORDR streamlines but doesn't eliminate.

### S2 — Audit fee compression
```
audit_fee_savings = audit_fee_annual
                  × pct_audit_fee_treasury_complexity
                  × audit_efficiency_factor
```
Where `audit_efficiency_factor = 0.4`. Conservative — auditors typically reduce hours when given a hash-chain-verified evidence bundle, but they don't drop the line item entirely.

### S3 — Regulatory penalty risk reduction
```
expected_annual_penalty_today = regulatory_submissions_per_year
                              × risk_pct_late_submission
                              × expected_penalty_per_incident

expected_annual_penalty_with_ordr = expected_annual_penalty_today × 0.1

penalty_risk_reduction = expected_annual_penalty_today
                       - expected_annual_penalty_with_ordr
```
ORDR cuts the late-submission probability by 90% (automated UTI generation + scheduled submission + WORM logging).

### S4 — FX spread improvement (TCA + counterparty)
```
fx_spread_savings = notional_hedged
                  × (tca_spread_improvement_bps / 10000)
```
Use `tca_spread_improvement_bps = 2` for the conservative case unless customer has high single-bank concentration (then use 4–5).

### S5 — Headcount avoidance (only count if explicitly relevant)
```
headcount_avoidance = avoided_fte_count × treasury_fully_loaded_cost
```

---

### Total annual savings
```
total_annual_savings = S1 + S2 + S3 + S4 + S5
```

### ORDR cost
```
ordr_cost_year_1 = ordr_subscription + ordr_implementation_fee
ordr_cost_steady_state = ordr_subscription
```

### Payback period
```
payback_months = ordr_cost_year_1 / (total_annual_savings / 12)
```

### Year 1 net ROI
```
year_1_net_roi = (total_annual_savings - ordr_cost_year_1) / ordr_cost_year_1
```

---

## Worked example 1 — Mid-market manufacturer

**Profile:** $400M revenue manufacturer, EU-based, exports to US + UK + Asia. Currently uses GTreasury for cash + spreadsheets for hedge accounting.

**Inputs:**
- `notional_hedged` = $120M
- `treasury_fte_count` = 3
- `treasury_fully_loaded_cost` = $150k
- `pct_time_on_hedge_accounting` = 25%
- `audit_fee_annual` = $400k
- `pct_audit_fee_treasury_complexity` = 8%
- `regulatory_submissions_per_year` = 800 (EMIR)
- `risk_pct_late_submission` = 2%
- `expected_penalty_per_incident` = $20k
- `tca_spread_improvement_bps` = 2
- ORDR tier: **Professional ($72k + $12k impl)**

**Calculations:**
- S1 = 3 × $150k × 0.25 × 0.6 = **$67,500**
- S2 = $400k × 0.08 × 0.4 = **$12,800**
- S3 = (800 × 0.02 × $20k) × 0.9 = **$288,000**
- S4 = $120M × (2/10000) = **$24,000**
- S5 = $0 (no avoided hire)
- **Total annual savings: $392,300**

- ORDR cost year 1: $84,000
- ORDR cost steady-state: $72,000

- **Payback period: $84k / ($392.3k / 12) = 2.6 months**
- **Year 1 net ROI: ($392.3k − $84k) / $84k = 367%**

**One-line for the deck:** *"Pays back in under 90 days. 4.7× year-1 ROI. The penalty-risk reduction alone covers the platform 3.4 times over."*

---

## Worked example 2 — Mid-market SaaS with multi-currency MRR

**Profile:** $200M ARR US-based SaaS, EUR/GBP/AUD/JPY revenue, hedges forward against US$ reporting currency.

**Inputs:**
- `notional_hedged` = $60M
- `treasury_fte_count` = 2
- `treasury_fully_loaded_cost` = $180k (higher base; US tech)
- `pct_time_on_hedge_accounting` = 30%
- `audit_fee_annual` = $250k
- `pct_audit_fee_treasury_complexity` = 12%
- `regulatory_submissions_per_year` = 0 (no EMIR — US only, ASC 815)
- `risk_pct_late_submission` = N/A
- `expected_penalty_per_incident` = N/A
- `tca_spread_improvement_bps` = 3
- ORDR tier: **Starter ($24k, no impl)**

**Calculations:**
- S1 = 2 × $180k × 0.30 × 0.6 = **$64,800**
- S2 = $250k × 0.12 × 0.4 = **$12,000**
- S3 = $0 (no EMIR exposure)
- S4 = $60M × (3/10000) = **$18,000**
- S5 = $0
- **Total annual savings: $94,800**

- ORDR cost year 1: $24,000
- **Payback period: $24k / ($94.8k / 12) = 3.0 months**
- **Year 1 net ROI: 295%**

**One-line for the deck:** *"At Starter pricing, payback is one quarter. The hedge accounting labor savings alone — recovered for actual treasury work — pay back the platform 2.7×."*

---

## Worked example 3 — Enterprise with active hedge program

**Profile:** $1.5B revenue diversified industrial, EU + US + APAC, 40 entities, 8 banks for FX execution.

**Inputs:**
- `notional_hedged` = $400M
- `treasury_fte_count` = 6
- `treasury_fully_loaded_cost` = $200k
- `pct_time_on_hedge_accounting` = 20%
- `audit_fee_annual` = $1.2M
- `pct_audit_fee_treasury_complexity` = 10%
- `regulatory_submissions_per_year` = 4,000
- `risk_pct_late_submission` = 1%
- `expected_penalty_per_incident` = $40k
- `tca_spread_improvement_bps` = 4 (high bank count = higher headroom)
- ORDR tier: **Enterprise ($180k + $48k impl)**
- Avoided hire: 1 hedge accounting analyst at $150k

**Calculations:**
- S1 = 6 × $200k × 0.20 × 0.6 = **$144,000**
- S2 = $1.2M × 0.10 × 0.4 = **$48,000**
- S3 = (4,000 × 0.01 × $40k) × 0.9 = **$1,440,000**
- S4 = $400M × (4/10000) = **$160,000**
- S5 = 1 × $150k = **$150,000**
- **Total annual savings: $1,942,000**

- ORDR cost year 1: $228,000
- **Payback period: $228k / ($1.94M / 12) = 1.4 months**
- **Year 1 net ROI: 752%**

**One-line for the deck:** *"For a treasury at this scale, ORDR is a rounding error — and the penalty-risk reduction alone is over 6× the platform cost. This is the deal where the auditor closes it for you."*

---

## How to present it to a prospect

1. **Get the inputs from them, on the call.** Don't pre-fill. Ask: "How many treasury FTEs? What % of their time is hedge accounting? What's your annual audit fee? How many EMIR submissions a year?" Listen, write it down, then plug in.
2. **Use their numbers, not yours.** If they say 10% time on hedge accounting, use 10%. Don't argue. The math still works.
3. **Always show the conservative case.** Use `ORDR_efficiency_factor = 0.6`, not 0.8. Use `tca_spread_improvement_bps = 2`, not 5. The skeptic in the room is your friend — they'll close the deal once you've already conceded the conservative bounds.
4. **Lead with payback period, not ROI %.** "Pays back in 3 months" is more persuasive than "350% year-1 ROI" — both are the same number, but CFOs trust payback.
5. **Don't promise savings; describe risk reduction.** S3 (regulatory penalty) is *expected value reduction*, not realized savings. Be careful to frame it that way: "If your team is currently running a 2% late-submission risk on 800 submissions a year, you're sitting on $320k of expected penalties. ORDR drops that to ~$32k."

---

## Spreadsheet formula reference (paste into Excel / Google Sheets)

Cells (column A = label, column B = value):

| Row | A (label) | B (value or formula) |
|---|---|---|
| 1 | Notional hedged ($M) | input |
| 2 | Treasury FTE count | input |
| 3 | Fully-loaded cost / FTE ($) | input |
| 4 | % time on hedge accounting | input (decimal, e.g. 0.25) |
| 5 | Audit fee ($) | input |
| 6 | % audit fee from treasury complexity | input (decimal) |
| 7 | Reg submissions / yr | input |
| 8 | Late-submission risk | input (decimal) |
| 9 | Expected penalty / incident ($) | input |
| 10 | TCA spread improvement (bps) | input |
| 11 | Avoided FTE count | input (often 0) |
| 12 | ORDR subscription ($) | input |
| 13 | ORDR implementation ($) | input |
| 14 | --- | --- |
| 15 | S1 — Labor recovered | =B2*B3*B4*0.6 |
| 16 | S2 — Audit fee compression | =B5*B6*0.4 |
| 17 | S3 — Penalty risk reduction | =B7*B8*B9*0.9 |
| 18 | S4 — FX spread savings | =B1*1000000*(B10/10000) |
| 19 | S5 — Avoided hire | =B11*B3 |
| 20 | Total annual savings | =SUM(B15:B19) |
| 21 | ORDR year-1 cost | =B12+B13 |
| 22 | Payback (months) | =B21/(B20/12) |
| 23 | Year-1 net ROI | =(B20-B21)/B21 |

---

## Web version (suggested)

If you build a web version of the calculator (Framer plugin / simple Next.js page), expose only inputs 1–11. Hard-code the ORDR tier defaults (auto-select tier based on `notional_hedged` and `treasury_fte_count`). Display only payback months + total annual savings. Bury the formula details behind "How we calculate this." Capture email at the end ("Email me a copy of these results") to gate it as a lead-gen.

---

## Caveat / disclaimer

> *"ROI estimates are based on customer inputs and conservative assumptions. Actual results depend on team size, hedge program complexity, regulatory exposure, and counterparty mix. ORDR TreasuryFX provides this calculator as a planning tool, not a guarantee of savings."*

Always include this on any printed handout and at the bottom of the web tool.
