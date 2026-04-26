# Hedge Policy Template

**Audience:** Customers who don't yet have a written FX hedge policy, or whose existing policy needs modernizing
**Format:** A starting template that customer's CFO + Treasurer + auditor can adopt with edits
**Reviewer:** This template should be reviewed by your external auditor and your finance leadership before adoption. ORDR provides the structure; the substantive choices are yours.

A written hedge policy is **mandatory** under both IFRS 9 and ASC 815 for hedge accounting designation. If you don't have one, you don't have hedge accounting in any defensible form.

---

# [Customer Name] — Foreign Exchange Hedge Policy

**Effective date:** [YYYY-MM-DD]
**Version:** 1.0
**Approved by:** [CFO or Treasury Committee]
**Approval date:** [YYYY-MM-DD]
**Next review:** [YYYY-MM-DD] (annually at minimum, or upon material change in business)

---

## 1. Purpose

This policy establishes [Company's] approach to managing foreign exchange (FX) risk arising from its operations and the documentation requirements for hedge accounting under [IFRS 9 / ASC 815 — choose the applicable framework].

The policy is intended to:

1. Define the risks the Company will hedge and the risks it will accept unhedged
2. Establish the strategies, instruments, and limits permitted in pursuit of those hedges
3. Establish the governance, authorization, and documentation framework for executing and accounting for hedges
4. Provide the documentation foundation for hedge accounting designation and effectiveness testing under [IFRS 9 / ASC 815]

This policy does **not** cover:

- Speculative trading of any kind (which is prohibited — see Section 9)
- FX risk arising from individual employee compensation
- FX risk in non-operating financial assets (treated under separate Investment Policy)

---

## 2. Risk taxonomy

The Company identifies the following categories of FX risk:

### 2.1 Transaction risk

FX risk arising from cash flows denominated in a currency other than the relevant entity's functional currency, including:

- Forecast revenues and expenses
- Confirmed but unsettled receivables and payables
- Intercompany loan principal and interest
- Forecast capital expenditure with foreign currency exposure

### 2.2 Translation risk

FX risk arising from the translation of net investments in foreign subsidiaries into the consolidated reporting currency.

### 2.3 Economic risk

FX risk arising from the impact of currency movements on the Company's competitive position. **The Company will not specifically hedge economic risk** — it is monitored but not managed via derivatives.

---

## 3. Risk management objectives

For each risk category that will be hedged, the Company has the following objective:

### 3.1 Transaction risk objective

Reduce the volatility of forecast and known foreign-currency cash flows in the consolidated reporting currency, with a target of hedging [X%] of forecast exposure on a rolling [N]-month horizon.

### 3.2 Translation risk objective

[If applicable] Reduce the volatility of net-investment translation in subsidiaries denominated in [list currencies], with a target hedge ratio of [X%] of the investment's notional amount.

### 3.3 Risks not hedged

The Company will not hedge:

- Forecast cash flows beyond [N] months unless approved by the Treasury Committee on a case-by-case basis
- Exposures below [threshold amount or %]
- Currencies not listed in Section 4.2 unless approved on a case-by-case basis
- Economic risk (per Section 2.3)

---

## 4. Hedging strategy

### 4.1 Approved hedge strategies

The Company permits the following hedge strategies:

| Strategy | When used | [IFRS 9 / ASC 815] designation |
|---|---|---|
| **Cash-flow hedge of forecast transactions** | Highly probable forecast exposures up to [N] months | Cash-flow hedge |
| **Fair-value hedge of recognised assets / liabilities** | Confirmed receivables / payables | Fair-value hedge |
| **Net-investment hedge** | Net investment in foreign subsidiary | Net-investment hedge |
| **Natural hedging via intercompany matching** | Where same-currency receivables and payables exist | Not designated; documented as natural hedge |

The Company will **not** designate:

- Anticipated transactions deemed less than highly probable
- Hedges of basis-risk-only exposures
- Net-position hedges where individual exposures aren't documented

### 4.2 Approved currencies

| Currency | Categories permitted |
|---|---|
| EUR | Cash-flow + fair-value + net-investment |
| GBP | Cash-flow + fair-value + net-investment |
| USD | (functional for [some entities]) |
| JPY | Cash-flow + fair-value |
| CHF | Cash-flow |
| ... | |

Currencies not on this list require Treasury Committee approval per transaction.

### 4.3 Approved instruments

The Company permits use of the following instruments:

| Instrument | Permitted use | Tenor cap | Maker / Checker |
|---|---|---|---|
| **FX spot** | Settle confirmed exposures | n/a | Treasurer / Controller |
| **FX forward** | All approved hedge strategies | 24 months | Treasurer / Controller |
| **NDF (non-deliverable forward)** | Restricted-currency cash-flow hedges | 12 months | Treasurer / Controller |
| **FX swap** | Roll-forward of existing hedges | 24 months | Treasurer / Controller |
| **FX options** | Approved on case-by-case basis only | 12 months | Treasurer / Controller / **CFO** |
| **Cross-currency swaps** | Net-investment hedges with funded foreign subsidiary debt | 5 years | Treasurer / Controller / **CFO** |

Instruments not on this list are **prohibited** without Treasury Committee approval and a documented rationale.

### 4.4 Hedge ratio

For each designated hedge:

- The hedge ratio is determined by the underlying exposure and the chosen instrument's notional, normally 1:1 for forwards on transaction risk
- The Company will not designate a hedge ratio that creates an "imbalance" intended to achieve an accounting outcome inconsistent with risk management
- The hedge ratio used in designation must equal the ratio used in actual risk management

---

## 5. Authorization and limits

### 5.1 Trading limits

| Instrument | Per-trade notional limit | Per-day cumulative limit | Approver |
|---|---|---|---|
| FX spot | [USD-equiv] | [USD-equiv] | Treasurer |
| FX forward (≤6m) | [USD-equiv] | [USD-equiv] | Treasurer |
| FX forward (>6m) | [USD-equiv] | [USD-equiv] | Controller |
| NDF | [USD-equiv] | [USD-equiv] | Controller |
| FX swap | [USD-equiv] | [USD-equiv] | Controller |
| FX option | n/a (case-by-case) | n/a | CFO |
| Cross-currency swap | n/a (case-by-case) | n/a | CFO |

Limits above the per-trade limits require Treasury Committee approval. Limits above the daily cumulative limits require CFO approval.

### 5.2 Counterparty limits

The Company maintains FX dealing relationships only with banks rated [BBB+] or better by [agency], or that have an established ISDA Master Agreement and Credit Support Annex with the Company.

| Counterparty | Notional limit | Tenor cap | Approval |
|---|---|---|---|
| [Bank A] | [USD-equiv] | [tenor] | [committee] |
| [Bank B] | [USD-equiv] | [tenor] | [committee] |
| [Bank C] | [USD-equiv] | [tenor] | [committee] |

Counterparty exposure is reviewed [quarterly] by the Treasury Committee.

### 5.3 Separation of duties

- The individual proposing a hedge **may not** be the individual approving the hedge
- The individual approving a hedge **may not** be the individual booking the accounting entry
- The system used to manage hedges (currently: ORDR TreasuryFX) **must enforce** these separations technically; operational reliance on the system is a control and is reviewed annually

---

## 6. Hedge documentation

### 6.1 At inception

For every designated hedge, the following documentation is created at inception:

1. **Hedged item identification** — what exposure is being hedged, in what amount, when expected to settle
2. **Hedging instrument identification** — what instrument, what counterparty, what trade date, what settlement date
3. **Risk being hedged** — which of the risks in Section 2 is being managed
4. **Hedge designation** — cash-flow / fair-value / net-investment under [IFRS 9 / ASC 815]
5. **Effectiveness assessment method** — critical-terms-match / regression / ratio analysis / dollar-offset (chosen per Section 7)
6. **Effectiveness assessment frequency** — at inception and at minimum each reporting period
7. **Risk-management objective and strategy** — reference to Section 3 and 4 of this policy

This documentation is captured in ORDR TreasuryFX's hedge-designation module and stored in the WORM audit ledger. The ledger entry's chain hash is the cryptographic timestamp.

### 6.2 Ongoing

For each reporting period:

1. Effectiveness reassessment per Section 7
2. Reconciliation of designated hedge to underlying exposure
3. Posting of hedge-accounting journal entries
4. Quarterly Treasury Committee review

### 6.3 At de-designation or termination

When a hedge is de-designated or the hedging instrument is terminated:

1. Reason for de-designation documented
2. Remaining ineffectiveness recognized in P&L
3. Cumulative gain/loss in OCI recycled per [IFRS 9 / ASC 815] rules
4. Audit ledger entry created with the de-designation event

---

## 7. Effectiveness assessment

### 7.1 Inception assessment

At inception, every designated hedge must demonstrate:

1. **Economic relationship** — values of hedged item and hedging instrument move in offsetting directions due to the same risk
2. **Credit risk does not dominate** — counterparty credit risk does not dominate the value changes
3. **Hedge ratio consistent** — the ratio used for designation equals the ratio used in actual risk management

### 7.2 Method by hedge type

| Hedge | Default method | Acceptable alternatives |
|---|---|---|
| FX forward on a known receivable | Critical-terms-match | Hypothetical derivative |
| FX forward on a forecast receipt | Hypothetical derivative | Regression (if currency pair has high basis risk) |
| Net-investment hedge with forward | Hypothetical derivative | — |
| Hedge with FX option | Hypothetical derivative; intrinsic vs. time value separated | — |
| Hedge with cross-currency swap | Hypothetical derivative | — |

### 7.3 Frequency

- **At inception**: yes, prospective assessment
- **At each reporting period (minimum quarterly)**: yes, prospective + retrospective
- **Upon any change** to the hedge or hedged item: yes

### 7.4 Threshold

- **Cash-flow and fair-value hedges (IFRS 9)**: economic relationship + credit risk + consistent ratio (no specific 80–125% bright line — but documented thresholds for regression or dollar-offset where used)
- **ASC 815 hedges**: critical-terms-match qualifies for the simplified method; otherwise regression with R² ≥ 0.80 and slope between -0.80 and -1.25

### 7.5 Action on ineffectiveness

If an effectiveness assessment fails:

1. The hedge is de-designated prospectively
2. The reason is documented
3. Treasury Committee is informed at next regular meeting
4. Cumulative ineffectiveness is recognized per the framework

---

## 8. Accounting

The Company applies hedge accounting under [IFRS 9 / ASC 815]. Specifically:

- **Cash-flow hedges**: effective portion of gain/loss to OCI; ineffective portion to P&L; OCI amounts recycled when hedged item affects P&L
- **Fair-value hedges**: gain/loss on hedging instrument to P&L; gain/loss on hedged item attributable to hedged risk to P&L
- **Net-investment hedges**: effective portion to OCI (currency-translation reserve); ineffective portion to P&L

The Company's chart of accounts and journal-entry templates for hedge accounting are maintained by the Controller's office and reflected in the ERP.

---

## 9. Prohibited activities

The following are **explicitly prohibited** by this policy:

1. **Speculation** — entering into FX positions for the purpose of profit not associated with an underlying business exposure
2. **Trading not aligned to a designated hedge or natural-hedge offset**
3. **Use of structured products** with embedded leverage, knock-out features, or non-linear payoff profiles unless explicitly approved by the Treasury Committee with a documented rationale
4. **Counterparty exposure** to entities not on the approved list in Section 5.2
5. **Use of instruments** not on the approved list in Section 4.3 without prior approval
6. **Hedge designation** that does not reflect actual risk management practice
7. **Off-system trading** — every hedge must be recorded in the system of record (ORDR TreasuryFX)

Violation of any item in Section 9 is a material policy breach and shall be reported to the Treasury Committee and external auditor.

---

## 10. Governance

### 10.1 Treasury Committee

The Treasury Committee oversees this policy and consists of:

- [CFO]
- [Treasurer]
- [Controller]
- [VP Finance / Head of FP&A]
- [(Optional) external advisor]

The Committee meets [quarterly], reviews hedge program performance, approves exceptions, and reviews this policy annually.

### 10.2 Roles

| Role | Responsibility |
|---|---|
| **CFO** | Owns this policy; approves material changes; chairs Treasury Committee |
| **Treasurer** | Executes the hedge program; proposes hedges; manages relationships with counterparties |
| **Controller** | Approves hedges within limits; books hedge accounting; produces audit pack |
| **Internal Audit** | Periodic audit of compliance with this policy (at least annually) |
| **External Auditor** | Reviews hedge accounting in connection with annual audit |

### 10.3 Policy revision

Material revisions to this policy require:

1. Treasury Committee proposal
2. CFO approval
3. Board notification (if material to risk profile)
4. New version stored as a WORM revision in ORDR TreasuryFX with cryptographic timestamp
5. All in-flight hedges reviewed for continued compliance with the new version

---

## 11. Records and retention

The Company retains the following records for [N] years (the longer of the regulatory minimum and the audit-cycle minimum):

- This policy and all prior revisions
- Designation documentation for every hedge
- Effectiveness assessments at inception and each reporting period
- Trade confirmations
- Counterparty agreements (ISDA, CSA)
- Treasury Committee minutes
- Audit reports

These records are stored in the WORM audit ledger of ORDR TreasuryFX and exported to the Company's record-retention system per its document-retention policy.

---

## 12. Approval

This policy is adopted on the effective date stated above by the undersigned:

```
___________________________________
[CFO Name], Chief Financial Officer
Date: __________

___________________________________
[Treasurer Name], Treasurer
Date: __________

___________________________________
[Controller Name], Controller
Date: __________
```

---

# Drafter's notes (delete before adoption)

- This template assumes a typical mid-market corporate. Adjust thresholds, currencies, instruments, counterparty limits, and tenor caps to your reality
- The choice between IFRS 9 and ASC 815 is jurisdictional — IFRS for most non-US, ASC 815 for US GAAP filers; some companies file both
- The "highly probable" forecast standard applies in both frameworks but is interpreted with some nuance — your auditor will guide
- Section 9 (prohibited activities) is the part audit committees read first. Don't water it down
- ORDR can host this policy as a WORM revision in the platform, with cryptographic timestamping. The platform records each revision's effective window so any historical hedge can be linked to the correct policy version
- For first-time adopters: most of the "approval" sections need to be filled in with names; the Treasury Committee should be operational *before* the policy is adopted
- Have your external auditor sign off on the effectiveness methods (Section 7) — variations on regression vs. critical-terms-match can have material accounting consequences
