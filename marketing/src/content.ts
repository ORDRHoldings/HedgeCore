// ORDR Treasury — all marketing copy for this product site.
// Edit here, not in page.tsx. The page renders this object.

export const CONTENT = {
  name: "ORDR Treasury",
  code: "TRSY",
  formerName: "TreasuryFX",
  discipline: "Capital Markets",
  status: "Production",
  statusTone: "#34D399",
  statusNote: "",
  accent: "#F5A800",

  tagline: "Prove every hedge.",
  heroLead:
    "FX hedge calculation, governance and audit for corporate treasury teams. A deterministic engine computes it, a four-eyes pipeline approves it, and an append-only audit chain proves it — line by line, to anyone who asks.",
  audience: "Corporate & group treasury · CFO office · audit and risk committees",

  liveUrl: "https://ordr-treasury.vercel.app",
  umbrellaUrl: "https://ordr-terminal.vercel.app",
  productPath: "/products/treasury",
  contactEmail: "demo@ordrholdings.com",

  panel: {
    title: "GOVERNANCE PIPELINE",
    note: "4-EYES · SEPARATION OF DUTIES",
    rows: [
      { left: "09:41:02", mid: "hedge.proposed · EUR 12.5M · R3", right: "SANDBOX" },
      { left: "09:44:17", mid: "validation.passed · fail-closed", right: "SANDBOX" },
      { left: "10:02:55", mid: "review.approved · treasurer", right: "STAGING" },
      { left: "10:03:41", mid: "review.approved · risk officer", right: "STAGING" },
      { left: "10:03:42", mid: "decision.committed · sha256:9f2c…", right: "LEDGER" },
      { left: "10:03:42", mid: "chain.appended · block 48211", right: "LEDGER" },
    ],
    footer: "append-only · no update · no delete",
  },

  numbers: [
    { value: "5,514", label: "automated tests" },
    { value: "60", label: "engine modules" },
    { value: "86", label: "product pages" },
    { value: "35", label: "report presets" },
  ],

  capabilities: [
    {
      title: "Deterministic hedge engine",
      body: "60 calculation modules — 46 pure kernel, 14 orchestrator — against the frozen R1–R8 exposure taxonomy. Same inputs, same outputs, every time; validation is fail-closed.",
    },
    {
      title: "Four-eyes governance",
      body: "Every decision moves SANDBOX → STAGING → LEDGER with separation of duties. Nothing reaches the ledger on one pair of hands.",
    },
    {
      title: "WORM audit chain",
      body: "A per-tenant append-only SHA-256 hash chain under every approved decision. No UPDATE, no DELETE — tampering is structurally visible.",
    },
    {
      title: "Full treasury lifecycle",
      body: "Position desk, natural hedging, pre-trade TCA, 13-week and 12-month cash-flow forecasting, cash pooling and netting, SWIFT pain.001 payments, debt and interest-rate risk.",
    },
    {
      title: "Regulatory coverage",
      body: "EMIR, MiFID II and Dodd-Frank submissions; IFRS 9 / ASC 815 hedge-effectiveness testing; Report Studio with 35 presets across 11 categories, exported to PDF, Excel or ZIP.",
    },
    {
      title: "Advisory-only AI",
      body: "The assistant explains, drafts and summarizes — and can never write to WORM tables. Humans decide; engines compute.",
    },
  ],

  how: {
    title: "From exposure to proof, in three moves.",
    steps: [
      {
        title: "Compute",
        body: "The deterministic engine classifies exposures against the frozen R1–R8 taxonomy and computes the hedge — reproducibly, with fail-closed validation on every input.",
      },
      {
        title: "Govern",
        body: "Proposals live in SANDBOX until a second pair of eyes promotes them through STAGING. Separation of duties is enforced by the platform, not by policy documents.",
      },
      {
        title: "Prove",
        body: "Approved decisions append to the tenant's SHA-256 WORM chain. When the auditor arrives, the answer is a chain verification, not an archaeology project.",
      },
    ],
  },

  assurance: [
    "Forced PostgreSQL row-level security — tenancy enforced in the database.",
    "RBAC with 9 roles × 63 permissions; Argon2id-hashed API keys.",
    "ERP connectors (QuickBooks, Xero, NetSuite, Sage, Dynamics) with paper-mode posting.",
    "WorkOS enterprise SSO; startup security guards.",
    "5,514 automated tests with a 70% coverage gate and 18 architecture decision records.",
  ],

  stack: "FastAPI · Python 3.12 · PostgreSQL 17 (forced RLS) · Next.js 15 · Render + Vercel",
  verify: "3f19c8e4a2d7",
  ledgerLine: "Part of the ORDR core: deterministic · audit-chained · fail-closed",
};

export type Content = typeof CONTENT;
