"use client";
/* eslint-disable no-restricted-syntax -- public light-theme marketing page outside the dark-terminal design tokens */

import TrustDocLayout, {
  H2, H3, P, UL, Callout, StatusTable, Pill,
} from "@/components/marketing/TrustDocLayout";

type Status = "ok" | "partial" | "planned" | "na";

function S({ s }: { s: Status }) {
  if (s === "ok")      return <Pill tone="ok">Implemented</Pill>;
  if (s === "partial") return <Pill tone="warn">Partial</Pill>;
  if (s === "planned") return <Pill tone="info">Planned</Pill>;
  return <Pill tone="muted">N/A</Pill>;
}

function CtrlRow({ id, name, status, evidence, next }: { id: string; name: string; status: Status; evidence: string; next?: string }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "70px 1fr 130px",
      gap: 12,
      padding: "12px 16px",
      borderBottom: "1px solid #F0F0F0",
      fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 13,
      alignItems: "start",
    }}>
      <div style={{
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700,
        color: "#111", letterSpacing: "0.05em",
      }}>{id}</div>
      <div>
        <div style={{ fontWeight: 600, color: "#111" }}>{name}</div>
        <div style={{ color: "#555", marginTop: 4, lineHeight: 1.5 }}>
          <strong style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#999" }}>Evidence:</strong> {evidence}
          {next ? (
            <>
              <br />
              <strong style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#999" }}>Next:</strong> {next}
            </>
          ) : null}
        </div>
      </div>
      <div><S s={status} /></div>
    </div>
  );
}

function CtrlSection({ heading, rows }: { heading: string; rows: { id: string; name: string; status: Status; evidence: string; next?: string }[] }) {
  return (
    <div style={{ margin: "24px 0" }}>
      <H3>{heading}</H3>
      <div style={{
        border: "1px solid #E5E7EB", borderRadius: 8,
        overflow: "hidden", background: "#FFFFFF",
      }}>
        {rows.map((r) => <CtrlRow key={r.id} {...r} />)}
      </div>
    </div>
  );
}

export default function Soc2ReadinessPage() {
  return (
    <TrustDocLayout
      eyebrow="SOC 2 Type II readiness attestation"
      title="SOC 2 Type II readiness attestation"
      lastReviewed="2026-04-25"
    >
      <Callout tone="warn">
        This is a self-attestation, not a third-party audit report. It is updated monthly until the Type II report is issued, at which point it is superseded.
      </Callout>

      <P>
        <strong>Audience:</strong> customer security teams, procurement, compliance reviewers.
      </P>

      <H2>Why this document exists</H2>
      <P>Customers need to make a buy decision before our Type II report is in hand. Three options exist:</P>
      <UL>
        <li><strong>Wait for Type II</strong> — kicks the customer&apos;s procurement timeline by 6+ months</li>
        <li><strong>Trust our marketing</strong> — not a real option for a serious enterprise procurement team</li>
        <li><strong>Read this</strong> — a structured, verifiable picture of where we are, with evidence we can show</li>
      </UL>
      <P>
        This document supports Option 3. It is paired with the SOC 2 contingency clause in the Order Form: customer&apos;s right to terminate without penalty if Type II is not delivered by an agreed date.
      </P>

      <H2>Trust Services Criteria — control-by-control status</H2>
      <P>
        The table walks through the <strong>Common Criteria (CC)</strong> + <strong>Availability (A)</strong> + <strong>Confidentiality (C)</strong> criteria. Privacy is covered separately under GDPR; Processing Integrity is deferred to v2.
      </P>

      <CtrlSection heading="CC1 — Control Environment" rows={[
        { id: "CC1.1", name: "Integrity & ethics policy", status: "ok", evidence: "Code of conduct in employee handbook", next: "Annualize sign-off process" },
        { id: "CC1.2", name: "Board oversight (or equivalent)", status: "partial", evidence: "Founder + advisor as informal board", next: "Formalize advisory board minutes" },
        { id: "CC1.3", name: "Org structure & authorities", status: "ok", evidence: "Org chart, role definitions, RACI" },
        { id: "CC1.4", name: "Personnel competence", status: "ok", evidence: "Hiring rubric, performance review" },
        { id: "CC1.5", name: "Accountability for controls", status: "ok", evidence: "Control owner assigned per control", next: "Quarterly attestation" },
      ]} />

      <CtrlSection heading="CC2 — Communication & Information" rows={[
        { id: "CC2.1", name: "Internal communication", status: "ok", evidence: "Slack #engineering + standups + retro cadence" },
        { id: "CC2.2", name: "External communication", status: "ok", evidence: "Status page, security@ inbox, status-page comms template" },
        { id: "CC2.3", name: "Security awareness training", status: "partial", evidence: "One-time orientation in place", next: "Annual refresher + tracked completion" },
      ]} />

      <CtrlSection heading="CC3 — Risk Assessment" rows={[
        { id: "CC3.1", name: "Risk identification", status: "ok", evidence: "OPEN_RISKS.md register; quarterly review" },
        { id: "CC3.2", name: "Fraud risk consideration", status: "partial", evidence: "Separation of Duties + 4-eyes pipeline", next: "Document fraud-risk-specific controls" },
        { id: "CC3.3", name: "Significant change ID", status: "ok", evidence: "Architecture freeze + ADR process" },
      ]} />

      <CtrlSection heading="CC4 — Monitoring Activities" rows={[
        { id: "CC4.1", name: "Ongoing monitoring", status: "ok", evidence: "Sentry, uptime monitoring, hash-chain integrity job" },
        { id: "CC4.2", name: "Communication of deficiencies", status: "ok", evidence: "Incident response process, post-mortem cadence" },
      ]} />

      <CtrlSection heading="CC5 — Control Activities" rows={[
        { id: "CC5.1", name: "Selection of controls", status: "ok", evidence: "This document" },
        { id: "CC5.2", name: "Technology control activities", status: "ok", evidence: "CI gates, branch protection, code review" },
        { id: "CC5.3", name: "Policies & procedures", status: "partial", evidence: "Engineering rules in .claude/rules/ + runbooks", next: "Formalize as numbered policy documents" },
      ]} />

      <CtrlSection heading="CC6 — Logical & Physical Access" rows={[
        { id: "CC6.1", name: "Logical access — provisioning", status: "ok", evidence: "SSO + MFA + role-based provisioning" },
        { id: "CC6.2", name: "Logical access — credentials", status: "ok", evidence: "bcrypt + JWT + rotation policy" },
        { id: "CC6.3", name: "Logical access — authorization", status: "ok", evidence: "RBAC 9×41 + fail-closed" },
        { id: "CC6.4", name: "Physical access", status: "na", evidence: "Cloud-only; physical controls inherited from sub-processors" },
        { id: "CC6.5", name: "Logical access termination", status: "ok", evidence: "Off-boarding within 1 business day" },
        { id: "CC6.6", name: "External authentication", status: "ok", evidence: "TLS 1.3, MFA required for admin" },
        { id: "CC6.7", name: "Transmission of confidential info", status: "ok", evidence: "TLS in transit; AES-256 at rest" },
        { id: "CC6.8", name: "Malicious code prevention", status: "ok", evidence: "Dependency scanning + container scanning" },
      ]} />

      <CtrlSection heading="CC7 — System Operations" rows={[
        { id: "CC7.1", name: "Vulnerability management", status: "ok", evidence: "gitleaks, Dependabot, pip-audit, npm audit, annual pen-test" },
        { id: "CC7.2", name: "System monitoring", status: "ok", evidence: "Sentry + Render-native + uptime monitoring" },
        { id: "CC7.3", name: "Incident response", status: "ok", evidence: "Incident response plan", next: "Annual tabletop" },
        { id: "CC7.4", name: "Incident communication", status: "ok", evidence: "Status page + customer comms template" },
        { id: "CC7.5", name: "Recovery from incidents", status: "ok", evidence: "BC plan", next: "Quarterly drill" },
      ]} />

      <CtrlSection heading="CC8 — Change Management" rows={[
        { id: "CC8.1", name: "Change authorization", status: "ok", evidence: "PR review + ADR process for frozen files" },
        { id: "CC8.2", name: "Change testing", status: "ok", evidence: "CI: ruff + pytest + tsc + next build + Playwright" },
        { id: "CC8.3", name: "Change implementation", status: "ok", evidence: "Auto-deploy with rollback path" },
      ]} />

      <CtrlSection heading="CC9 — Risk Mitigation" rows={[
        { id: "CC9.1", name: "Risk mitigation activities", status: "ok", evidence: "This entire document" },
        { id: "CC9.2", name: "Vendor risk management", status: "ok", evidence: "Sub-processor evaluation + annual review", next: "Formalize vendor questionnaire log" },
      ]} />

      <CtrlSection heading="A — Availability" rows={[
        { id: "A1.1", name: "Capacity planning", status: "ok", evidence: "Render auto-scaling; Postgres metrics" },
        { id: "A1.2", name: "Backup & recovery", status: "ok", evidence: "Continuous WAL + nightly + weekly off-platform; quarterly drill" },
        { id: "A1.3", name: "Environmental protection", status: "na", evidence: "Cloud-inherited from sub-processors" },
      ]} />

      <CtrlSection heading="C — Confidentiality" rows={[
        { id: "C1.1", name: "Identification & maintenance", status: "ok", evidence: "Data classification matrix in security overview" },
        { id: "C1.2", name: "Disposal of confidential info", status: "ok", evidence: "DPA-defined retention + deletion on termination", next: "Automate proof-of-deletion attestation" },
      ]} />

      <H2>Summary — what&apos;s open at audit time</H2>
      <P>
        Items currently marked <strong>Partial</strong> or with a &quot;Next&quot; entry are the gaps to close before the Type II observation period begins:
      </P>
      <UL>
        <li><strong>Annualized sign-off</strong> on the integrity & ethics policy (CC1.1) — adds a tracked artifact</li>
        <li><strong>Advisory board minutes</strong> (CC1.2) — formalize what already happens informally</li>
        <li><strong>Annual security awareness training</strong> with completion tracking (CC2.3)</li>
        <li><strong>Fraud-risk control documentation</strong> (CC3.2) — connect 4-eyes to fraud-risk language</li>
        <li><strong>Numbered policy documents</strong> for engineering rules (CC5.3)</li>
        <li><strong>Vendor questionnaire log</strong> (CC9.2)</li>
        <li><strong>Automated proof-of-deletion attestation</strong> (C1.2)</li>
      </UL>
      <Callout>
        None of the seven gaps are about <em>whether</em> the control operates; they are about formalization and evidence-collection. This is the typical pattern for a pre-Type-II SaaS company.
      </Callout>

      <H2>How to use this document</H2>
      <StatusTable rows={[
        { label: "Procurement team", value: "Use this in lieu of a SOC 2 report; pair with the Order Form contingency clause" },
        { label: "CISO", value: "Read alongside the security overview; request the assurance evidence pack under NDA" },
        { label: "Auditor", value: "Treat this as ORDR's self-assessment; full evidence is available under NDA" },
        { label: "Investor", value: "A meaningful signal of operational maturity; ask to see the underlying evidence pack" },
      ]} />

      <H2>Signed</H2>
      <P>
        This attestation is issued in good faith. We are not lawyers, and this is not a legal compliance certification. We have reviewed every row and stand behind every status mark.
      </P>
      <P>
        <strong>ORDR TreasuryFX</strong> — Founder + DPO + Lead Engineer (signatures captured in the issued PDF) — 2026-04-25
      </P>
      <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 14, color: "#999", margin: "16px 0 0" }}>Next review: 2026-05-25</p>
    </TrustDocLayout>
  );
}
