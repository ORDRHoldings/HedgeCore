"use client";
/* eslint-disable no-restricted-syntax -- public light-theme marketing page outside the dark-terminal design tokens */

import TrustDocLayout, {
  H2, P, UL, Callout, StatusTable, Pill,
} from "@/components/marketing/TrustDocLayout";

export default function CompliancePage() {
  return (
    <TrustDocLayout
      eyebrow="Compliance status"
      title="Compliance status"
      lastReviewed="2026-04-25"
    >
      <P>
        Format: each row says where we are, what evidence exists, and what&apos;s still open. Reviewed monthly.
      </P>

      <H2>SOC 2 Type II</H2>
      <StatusTable rows={[
        { label: "Engagement", value: "Auditor selection in progress (target: Big 4 or top mid-tier with SaaS specialty)" },
        { label: "TSC in scope", value: "Security, Availability, Confidentiality (Privacy and Processing Integrity deferred to v2 expansion)" },
        { label: "Type I report", value: <span><Pill tone="info">Targeted</Pill> Q2 2026</span> },
        { label: "Type II observation", value: <span><Pill tone="info">Targeted</Pill> Q3 2026 (90-day minimum window)</span> },
        { label: "Type II report delivery", value: <span><Pill tone="info">Targeted</Pill> Q4 2026</span> },
        { label: "Bridge document", value: <a href="/trust/soc2" style={{ color: "#1E3A5F" }}>SOC 2 readiness attestation</a> },
      ]} />
      <P>
        <strong>What this means for customers today:</strong> customers who require SOC 2 Type II for procurement signing can:
      </P>
      <UL>
        <li>Use the readiness attestation as an interim</li>
        <li>Negotiate a SOC 2 contingency clause in the Order Form (buyer&apos;s right to terminate without penalty if Type II is not delivered by a target date)</li>
        <li>Receive the Type II report as soon as it is issued</li>
      </UL>
      <Callout>
        We do not claim SOC 2 Type II compliance until the report is in hand. Anything else is misleading.
      </Callout>

      <H2>ISO 27001</H2>
      <P>
        Not started. Planned for post-Series A. We expect the SOC 2 Type II workstream to produce 70% of the artifacts required for ISO certification.
      </P>

      <H2>GDPR (UK + EU + Switzerland)</H2>
      <StatusTable rows={[
        { label: "Lawful basis documented", value: <span><Pill tone="ok">Yes</Pill> Privacy notice</span> },
        { label: "Data Processing Addendum", value: <span><Pill tone="ok">Yes</Pill> DPA template</span> },
        { label: "SCCs Module Two", value: <span><Pill tone="ok">Yes</Pill> DPA Annex referenced</span> },
        { label: "UK Addendum (B1.0)", value: <span><Pill tone="ok">Yes</Pill> DPA</span> },
        { label: "Swiss FADP modifications", value: <span><Pill tone="ok">Yes</Pill> DPA</span> },
        { label: "Sub-processor list (public)", value: <span><Pill tone="ok">Yes</Pill> 30-day change notice</span> },
        { label: "Data residency (EU-only option)", value: <span><Pill tone="ok">Yes</Pill> Frankfurt region available</span> },
        { label: "Data Protection Officer", value: <span><Pill tone="ok">Yes</Pill> dpo@ordrtreasuryfx.com (designated; external counsel reviews)</span> },
        { label: "ROPA", value: <span><Pill tone="info">Internal</Pill> Available under NDA; maintained by DPO</span> },
        { label: "DPIA template", value: <span><Pill tone="info">Internal</Pill> Available under NDA — for Customer DPIA support</span> },
        { label: "Subject access request workflow", value: <span><Pill tone="ok">Yes</Pill> Per privacy notice; 30-day SLA</span> },
        { label: "Personal Data Breach process", value: <span><Pill tone="ok">Yes</Pill> 72-hour assessment window</span> },
      ]} />

      <H2>CCPA / CPRA</H2>
      <StatusTable rows={[
        { label: "Service Provider terms in DPA", value: <span><Pill tone="ok">Yes</Pill> DPA §13</span> },
        { label: "Do not sell or share", value: <span><Pill tone="ok">Honored</Pill> ORDR does not sell or share Personal Information for cross-context behavioural advertising</span> },
        { label: "Right-to-know workflow", value: <span><Pill tone="ok">Yes</Pill> Privacy notice</span> },
        { label: "Right-to-delete workflow", value: <span><Pill tone="ok">Yes</Pill> Privacy notice</span> },
        { label: "Right-to-correct workflow", value: <span><Pill tone="ok">Yes</Pill> Privacy notice</span> },
        { label: "Sensitive PI use", value: <span><Pill tone="muted">None</Pill> ORDR does not use Sensitive PI for any non-service purpose</span> },
      ]} />

      <H2>Hedge accounting (customer-facing)</H2>
      <P>ORDR provides modules that <strong>support</strong> customer compliance with:</P>
      <StatusTable rows={[
        { label: "IFRS 9", value: "Hedge Effectiveness, Audit Lab — cash-flow, fair-value, net-investment hedges" },
        { label: "ASC 815", value: "Hedge Effectiveness, Audit Lab — equivalent treatment for US GAAP" },
        { label: "EMIR Refit", value: "Regulatory Submissions — UTI-stamped XML generation; Customer is the reporting entity" },
        { label: "MiFID II best-ex", value: "Pre-Trade TCA — Customer's auditable best-ex evidence" },
        { label: "CFTC", value: "Regulatory Submissions — US derivatives reporting flows" },
      ]} />
      <P>Customer remains the Controller and the regulatory reporting entity. ORDR is the Processor and the platform.</P>

      <H2>OWASP</H2>
      <StatusTable rows={[
        { label: "OWASP ASVS Level 2 mapping", value: <span><Pill tone="info">Internal</Pill> Under NDA</span> },
        { label: "OWASP Top 10 coverage", value: "Annual pen-test scoped explicitly to Top 10 + Treasury-specific scenarios" },
        { label: "Dependency Check", value: "Continuous via Dependabot + pip-audit" },
      ]} />

      <H2>Penetration testing</H2>
      <StatusTable rows={[
        { label: "Frequency", value: "Annual external" },
        { label: "Last test", value: "Initial test in progress prior to first report" },
        { label: "Firm", value: "Independent firm — disclosed under NDA" },
        { label: "Scope", value: "Application + API + auth + multi-tenant isolation + cryptographic implementations" },
        { label: "Critical findings open", value: <Pill tone="ok">0</Pill> },
        { label: "Executive summary", value: <span><Pill tone="info">Available</Pill> Under NDA</span> },
      ]} />
      <Callout>
        If we have any open Critical findings at any time, this row is updated to show it, with a target remediation date. We do not hide them.
      </Callout>

      <H2>Backup-restore drills</H2>
      <StatusTable rows={[
        { label: "Cadence", value: "Quarterly" },
        { label: "Most recent", value: "Drill log maintained internally; available under NDA" },
        { label: "Hash-chain integrity post-restore", value: <span><Pill tone="ok">Verified</Pill> on each drill</span> },
      ]} />
      <P>A failed drill is itself an incident with a post-mortem and action items.</P>

      <H2>Insurance</H2>
      <StatusTable rows={[
        { label: "Cyber liability", value: <span><Pill tone="info">Procuring</Pill> Coverage limits available on request</span> },
        { label: "Errors & Omissions", value: <span><Pill tone="info">Procuring</Pill> Coverage limits available on request</span> },
        { label: "General liability", value: <span><Pill tone="info">Procuring</Pill> Coverage limits available on request</span> },
      ]} />
      <P>Certificate of Insurance available on request to procurement.</P>

      <H2>Audit and assurance evidence package</H2>
      <P>For prospects under NDA, the assurance pack contains:</P>
      <UL>
        <li>SOC 2 Type II readiness attestation (this trust center)</li>
        <li>Most recent pen-test executive summary</li>
        <li>Most recent backup-restore drill attestation</li>
        <li>Sub-processor list with last review date</li>
        <li>ROPA + DPIA-support template</li>
        <li>Threat-model summary</li>
        <li>Insurance Certificate(s)</li>
        <li>Sample audit-pack (export from a demo tenant — no real Customer Data)</li>
        <li>Hash-chain verification walkthrough (worked example)</li>
        <li>Architectural one-pager + this trust center</li>
      </UL>
      <P>
        To request: email <a href="mailto:security@ordrtreasuryfx.com" style={{ color: "#1E3A5F" }}>security@ordrtreasuryfx.com</a> under NDA. We deliver within 5 business days.
      </P>

      <H2>Where we publicly stand vs. where we honestly want to be</H2>
      <StatusTable rows={[
        { label: "SOC 2 Type II in progress", value: "→ Type II report in customer hands" },
        { label: "Annual pen-test", value: "→ Continuous attack surface monitoring + bug bounty" },
        { label: "Single-region per customer", value: "→ Multi-region failover for Enterprise (Q1 2027)" },
        { label: "Manual customer data export", value: "→ One-click self-serve export (Q3 2026)" },
        { label: "Email-based DSAR", value: "→ In-app DSAR workflow (Q4 2026)" },
        { label: "Quarterly restore drill", value: "→ Monthly automated restore-drill in CI" },
      ]} />
      <P>This page is updated as items move from &quot;today&quot; to &quot;goal.&quot; We don&apos;t move them silently.</P>
    </TrustDocLayout>
  );
}
