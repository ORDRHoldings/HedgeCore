# Glossary

**Audience:** Anyone reading ORDR's docs, decks, or contracts who isn't already a treasury practitioner — investors, IT/security teams, auditors crossing into a new domain, journalists, new hires
**Style:** Plain language. Treasury-jargon decoded into operational meaning. We won't pretend any term is "obvious."

If a term you're looking for isn't here, email **hello@ordrtreasuryfx.com** and we'll add it.

---

## Core terms

### Hedge

A transaction entered into to offset (in part or whole) the financial impact of an existing or expected exposure. In FX, typically a forward contract that locks in a future rate so the company isn't exposed to currency movements between today and a future cash flow.

### Exposure

A future cash flow whose value depends on something the company doesn't control — most commonly an exchange rate. A €10M receivable due in 6 months is an FX exposure: how many dollars it produces depends on EUR/USD on the settlement date.

### FX (Foreign Exchange)

The buying or selling of one currency for another, or a contract that does this on a future date.

### Spot

An FX trade settling today (technically T+2 by convention). The "spot rate" is the current market rate.

### Forward

A contract to exchange currencies at a fixed rate on a future date. Locks in the rate today; settles later. The most common hedging instrument.

### NDF (Non-Deliverable Forward)

A forward where the parties don't actually exchange the underlying currencies — they cash-settle the difference. Used for currencies that have local restrictions on trading (e.g., some emerging-market currencies).

### Swap (FX Swap)

Two simultaneous FX trades — buy spot and sell forward, or vice versa. Usually used to roll an existing hedge forward in time.

### Option (FX Option)

A right (not an obligation) to buy or sell a currency at a specific rate on or before a future date. Costs an upfront premium. More flexible than a forward but more expensive.

### Cross-currency swap

A longer-dated instrument that exchanges principal and interest in one currency for principal and interest in another. Used for net-investment hedges and long-tenor structural exposures.

---

## Hedge accounting

### Hedge accounting

Special accounting treatment that allows companies to match the timing of gains/losses on hedging instruments with the timing of the underlying exposure they're hedging — preventing P&L volatility that would otherwise misrepresent the economics. **It is optional** but tightly governed: companies must qualify, document, and prove ongoing effectiveness.

### IFRS 9

The international hedge-accounting standard. Applies to non-US filers and many US filers with international operations. Three hedge types: cash-flow, fair-value, net-investment.

### ASC 815

The US GAAP hedge-accounting standard. Conceptually similar to IFRS 9 with subtle differences in effectiveness testing and de-designation rules. Most large US public filers use ASC 815.

### Cash-flow hedge

Hedging variability in forecast cash flows (e.g., a forecast EUR receivable). Effective portion of the hedge's gain/loss goes to OCI (other comprehensive income) and recycles to P&L when the hedged cash flow occurs.

### Fair-value hedge

Hedging the change in fair value of a recognised asset or liability (e.g., a confirmed EUR receivable on the balance sheet). Both the hedge and the hedged item revalue through P&L.

### Net-investment hedge

Hedging the FX risk on a net investment in a foreign subsidiary (e.g., the GBP-denominated equity of a UK subsidiary on a US-functional-currency parent's balance sheet). Effective portion goes to OCI (CTA — Cumulative Translation Adjustment).

### Hedge ratio

The ratio of hedging-instrument notional to hedged-exposure notional. Usually 1:1 for forward-vs-receivable. Must reflect actual risk management, not be tuned for accounting outcomes.

### Effectiveness

The degree to which the hedging instrument actually offsets the hedged risk. Must be assessed at inception and at each reporting period (typically quarterly). Failure to qualify breaks hedge accounting prospectively.

### Critical-terms-match

The simplest effectiveness method: when the hedging instrument's notional, currency, and timing exactly match the hedged exposure's, you can presume effectiveness. Most FX forwards qualify.

### Hypothetical derivative

A modeling concept used in effectiveness testing — what would a "perfect" hedge look like? Compare your real hedge against the hypothetical to measure deviation.

### Regression-based effectiveness

A statistical approach: regress changes in the hedge's value against changes in the hedged item's value. Common acceptance thresholds: R² ≥ 0.80 and slope between -0.80 and -1.25.

### De-designation

Stopping hedge accounting on a hedge that's still active. Triggers cumulative effectiveness recognition and OCI recycling per the relevant framework. Done when the hedged item changes, the hedge fails effectiveness, or the policy is revised.

### Designation memo

The document at hedge inception that records: what's being hedged, what the hedging instrument is, what risk is being managed, what method effectiveness will be assessed by, what the strategy is. Required by both IFRS 9 and ASC 815. Auditors look for this first.

---

## Governance and risk

### R1–R8 risk taxonomy

ORDR's internal taxonomy of the eight risk types relevant to FX hedge programs: transaction risk, translation risk, economic risk, basis risk, settlement risk, counterparty risk, operational risk, and liquidity risk. Used to map every exposure and hedge to a specific risk being managed. **Frozen in v1**: cannot be modified without an Architecture Decision Record.

### Maker / Checker (4-Eyes)

A control where the person who proposes an action is different from the person who approves it. Standard in financial controls. ORDR enforces this technically: the system rejects approvals from the same user who created the proposal.

### Separation of Duties (SoD)

The principle that no single individual should be able to complete a transaction end-to-end. Maker/checker is the most common form. Also applies to: trade execution vs. accounting booking, system administration vs. business operation, etc.

### WORM

"Write Once Read Many" — data that, once written, cannot be modified or deleted. ORDR's audit_events, calculation_runs, policy_revisions, and ledger_entries tables are WORM at three layers: application, database trigger, and operational policy.

### Hash chain

A cryptographic structure where each record's hash includes the prior record's hash. Modifying any historical record breaks the chain at that point, making tampering detectable. ORDR uses SHA-256, per-tenant, starting from a published GENESIS_HASH.

### Audit pack

The exportable bundle that contains every artifact an auditor needs for a period: hedge designation memos, effectiveness tests, approvals, ledger postings, access controls, system-level controls. ORDR generates these as a single signed ZIP. Walkthrough: [auditor evidence walkthrough](sales/auditor-evidence-walkthrough.md).

### Tri-state pipeline

ORDR's three-stage proposal flow: SANDBOX → STAGING → LEDGER. Sandbox is for exploration. Staging is the maker/checker review state. Ledger is the immutable, hash-chained committed state. Once a row is in the ledger, it's WORM.

---

## Regulatory

### EMIR

European Market Infrastructure Regulation. Requires reporting of derivatives trades to a trade repository. EMIR Refit (2024) introduced new reporting fields and stricter UTI rules. Customer is the reporting entity; ORDR generates the required XML.

### MiFID II

EU directive that requires (among many things) "best execution" evidence on derivatives trades. ORDR's Pre-Trade TCA module produces this evidence in auditor-acceptable form.

### CFTC reporting

US derivatives reporting under Dodd-Frank. Similar in spirit to EMIR but with US-specific scope and data fields.

### UTI (Unique Trade Identifier)

A trade-level identifier required under EMIR Refit (and similar regimes globally). Must be unique per trade, generated deterministically, and consistent across the trade's lifecycle.

### MT103

The SWIFT message format for a single customer credit transfer (i.e., a payment instruction). Used to instruct a bank to make a payment in the underlying currency. Being progressively replaced by ISO 20022 pain.001.

### ISO 20022 pain.001

A modern XML-based payment instruction message, replacing MT103 in many contexts. CBPR+ is the cross-border-payment profile that's becoming the global standard for bank-to-bank payment instructions.

---

## Technical / platform

### Deterministic engine

Code where the same inputs always produce the same outputs — no randomness, no time-dependence, no learned state. ORDR's `engine_v1` kernel is deterministic by design. This is the difference between "we calculated 0.78" and "given these inputs, anyone running the same kernel will calculate 0.78."

### RunEnvelope

ORDR's snapshot of every input that went into a calculation: exposure data, market snapshot, policy revision, kernel version, parameters. The envelope's hash uniquely identifies the calculation. Re-running the kernel with the envelope reproduces the output bit-for-bit, months or years later.

### Architecture freeze

ORDR's commitment to keep certain code paths stable: the engine kernel, the validator, the audit chain, the WORM models, the security core. Changes require an Architecture Decision Record (ADR). The freeze is what makes the platform trustworthy for governance use.

### ADR (Architecture Decision Record)

A short document recording an architectural decision, its context, and its consequences. Used to gate changes to frozen files. Numbered sequentially. Stored in `docs/architecture/adr/`.

### RBAC (Role-Based Access Control)

Authorization model where permissions are granted to roles, and roles are granted to users. ORDR has 9 roles × 41 permissions × hierarchy levels 0–15. Fail-closed: missing permission means denied.

### Fail-closed

A security principle: when ambiguous, deny access rather than allow. ORDR's input validator and authorization layers are fail-closed. Compare to *fail-open*, which is reserved for non-critical paths (e.g., the cache: if Redis is down, the application serves recent data rather than failing — but cannot bypass authorization).

### Multi-tenant isolation

The architectural property that one customer's data cannot be accessed by another customer's session. ORDR enforces this at the ORM layer: every query is scoped by `tenant_id`; cross-tenant joins do not exist in the codebase.

### Tenant

A single customer organization in ORDR. Each tenant has its own users, data, hedge program, audit chain, and (optionally on Enterprise) database.

### Data residency

The geographic region where Customer Data is stored. ORDR offers EU (Frankfurt) or US (us-east-1). Data does not leave the chosen region.

### Sub-processor

A third-party service ORDR uses to provide the platform — e.g., the cloud host, the CDN, error-monitoring service, transactional email provider. Distinct from "vendors" generally because sub-processors process Customer Data on ORDR's behalf, and customers must be notified of changes per the DPA. Public list: [sub-processors](../legal/sub-processors.md).

---

## Compliance and security

### SOC 2

A third-party audit of a service organization's internal controls. Type I tests design at a point in time. Type II tests operating effectiveness over a 90-day-or-longer window. ORDR's Type II is targeted for Q3 2026.

### ISO 27001

An international information-security management system standard. Independent certification. Roadmap for ORDR post-Series A.

### GDPR

EU's General Data Protection Regulation. Governs how Personal Data is processed. ORDR is GDPR-compliant by design — see [DPA](../legal/dpa.md).

### CCPA / CPRA

California's Consumer Privacy Act / Privacy Rights Act. ORDR's DPA includes Service Provider terms for CCPA scope.

### SCC (Standard Contractual Clauses)

EU-approved contract clauses that govern transfers of Personal Data outside the EEA. ORDR uses SCCs Module Two (Controller → Processor) plus the UK Addendum and Swiss FADP modifications where applicable.

### DPA (Data Processing Addendum / Agreement)

A contract between a data Controller and a data Processor that governs the Processing. Required by GDPR. ORDR's [DPA](../legal/dpa.md) is the template; an executed version is signed at customer onboarding.

### Personal Data Breach

A security incident leading to accidental or unlawful destruction, loss, alteration, unauthorized disclosure, or access to Personal Data. Triggers GDPR notification obligations (72-hour assessment window).

---

## Pricing and packaging

### ACV (Annual Contract Value)

The annual subscription fee for a customer. ORDR's tiers: Starter $24k, Professional $72k, Enterprise from $144k.

### Implementation fee

A one-time fee for onboarding services on Professional and Enterprise tiers. Starter is self-serve.

### Order Form

The contract document that specifies a particular customer's tier, fees, term, and any custom terms. Issued under the MSA.

### MSA (Master Subscription Agreement)

The umbrella contract governing the relationship. Customer signs it once; multiple Order Forms can be issued under it over time.

### AUP (Acceptable Use Policy)

The list of activities that aren't allowed on the platform. Exhibit B in ORDR's MSA.

### SLA (Service Level Agreement)

The availability and response-time commitments. ORDR Enterprise SLA is 99.9% monthly uptime + 4-hour Sev-1 response 24/7.

### Service credit

Compensation for SLA breach, applied to the next invoice. ORDR's credit table is in MSA Exhibit A.

---

## Operational

### Sev-1 / Sev-2 / Sev-3 / Sev-4

Severity levels for incidents. Sev-1 = production unavailable or data integrity at risk. Sev-2 = major degradation. Sev-3 = minor degradation with workaround. Sev-4 = cosmetic. See [incident response plan](../ops/incident-response-plan.md).

### RTO (Recovery Time Objective)

The maximum tolerable time from disaster to service restored. ORDR's RTO for critical service is 4 hours.

### RPO (Recovery Point Objective)

The maximum tolerable data loss measured in time. ORDR's RPO for the application is 15 minutes; for the audit ledger it's effectively zero (the WORM ledger and its chain head are continuously archived).

### BC / DR

Business Continuity / Disaster Recovery. ORDR's plan: [business-continuity.md](../ops/business-continuity.md).

### Off-platform backup

A copy of customer data stored on infrastructure outside the primary cloud provider. Defends against single-vendor failure. ORDR maintains weekly encrypted off-platform backups in addition to cloud-provider-native backups.

### Sub-processor change notice

The 30-day notification we send before adding or replacing a sub-processor. Customers may object on reasonable grounds.

---

## Acronym quick-reference

| Acronym | Stands for |
|---|---|
| ACV | Annual Contract Value |
| ADR | Architecture Decision Record |
| ASC 815 | Accounting Standards Codification 815 (US GAAP hedge accounting) |
| AUP | Acceptable Use Policy |
| BC / DR | Business Continuity / Disaster Recovery |
| CCPA / CPRA | California Consumer Privacy Act / Rights Act |
| CFTC | Commodity Futures Trading Commission |
| CSA | Credit Support Annex (under ISDA) |
| CSP | Content Security Policy |
| CTA | Cumulative Translation Adjustment |
| DPA | Data Processing Addendum / Agreement |
| DPO | Data Protection Officer |
| EMIR | European Market Infrastructure Regulation |
| ERP | Enterprise Resource Planning |
| FADP | Swiss Federal Act on Data Protection |
| FX | Foreign Exchange |
| GDPR | General Data Protection Regulation |
| IFRS 9 | International Financial Reporting Standard 9 |
| ISDA | International Swaps and Derivatives Association |
| JWT | JSON Web Token |
| MFA | Multi-Factor Authentication |
| MiFID II | Markets in Financial Instruments Directive II |
| MSA | Master Subscription Agreement |
| MT103 | SWIFT message type 103 (single customer credit transfer) |
| NDF | Non-Deliverable Forward |
| OCI | Other Comprehensive Income |
| OIDC | OpenID Connect |
| ORM | Object-Relational Mapping |
| OWASP | Open Web Application Security Project |
| pain.001 | ISO 20022 payment instruction message |
| RBAC | Role-Based Access Control |
| ROPA | Records of Processing Activities |
| RPO | Recovery Point Objective |
| RTO | Recovery Time Objective |
| SAML | Security Assertion Markup Language |
| SCC | Standard Contractual Clauses |
| SCIM | System for Cross-domain Identity Management |
| Sev | Severity (incident classification) |
| SLA | Service Level Agreement |
| SoD | Separation of Duties |
| SOC | System and Organization Controls |
| SSO | Single Sign-On |
| STRIDE | Spoofing/Tampering/Repudiation/Info Disclosure/DoS/Elevation of Privilege |
| TCA | Transaction Cost Analysis |
| TLS | Transport Layer Security |
| TMS | Treasury Management System |
| UTI | Unique Trade Identifier |
| WAL | Write-Ahead Log |
| WORM | Write Once Read Many |
