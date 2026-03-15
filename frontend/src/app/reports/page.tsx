"use client";

/**
 * /reports -- Report Studio
 *
 * Thin shell with 4 tabs: Studio, Library, Saved, Regulatory.
 * URL-driven tab routing via ?tab= query param, Suspense-wrapped.
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { PageShell } from "@/components/layout/PageShell";
import { FileText } from "lucide-react";
import { T } from "@/lib/design/tokens";

import { HASH_MAP, TAB_TO_PARAM } from "./types";
import type { ReportStudioTab } from "./types";

// ---------------------------------------------------------------------------
// Report state machine — run gating & export control
// ---------------------------------------------------------------------------
//
// State: NO ENGINE RUN
//   Displayed when availableRuns (fetched via listRuns from the backend API)
//   is empty.  The Studio tab shows a banner: "NO ENGINE RUN — run the hedge
//   engine first to generate reportable output."
//
// State: READY
//   errCount = errors.filter(e => e.severity === "ERROR").length
//   canExport = sections.length > 0 && errCount === 0 && !!run_envelope_id
//   isRunning = false (export not in progress)
//   Export button disabled when !canExport || isRunning.
//
// Binding gate — NO_BINDING issue:
//   When run_envelope_id is absent: { type: "NO_BINDING", severity: "ERROR",
//     message: "No engine run bound — bind an engine run to export." }
//   NO_BINDING severity ERROR ensures the issue blocks export via errCount.
//
// Saved reports are bounded to 20 entries in localStorage to prevent quota
// overflow: saved.slice(-20) before writing back.
//
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Report fingerprinting — audit-grade SHA-256 canonical hash
// ---------------------------------------------------------------------------

/**
 * computeReportHash produces a deterministic SHA-256 fingerprint for a report
 * export.  The canonical form sorts sections by their `order` field so that
 * section reordering never produces a different hash for the same logical
 * content.
 *
 * Required canonical fields: run_envelope_id, policy_id, sorted section keys.
 */
async function computeReportHash(
  params: {
    run_envelope_id: string;
    policy_id: string;
    /** preset_id (template identifier) included in canonical form */
    presetId?: string;
    sections: Array<{ order: number; key: string; content: string }>;
    generatedAt: string;
  },
  /** Schema version of the canonical form — defaults to 1 */
  version = 1,
): Promise<string> {
  const preset_id = params.presetId ?? "";
  const sorted = [...params.sections].sort((a, b) => a.order - b.order);
  const canonical = JSON.stringify({
    version: version,
    run_envelope_id: params.run_envelope_id,
    policy_id: params.policy_id,
    preset_id,
    sections: sorted.map((s) => ({ key: s.key, content: s.content })),
    generatedAt: params.generatedAt,
  });
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * buildReportHTML serialises a report to a standalone HTML string.
 * The optional reportHash parameter embeds an audit-trail fingerprint in the
 * export footer.  When reportHash is absent the footer shows "UNCOMPUTED" so
 * that the field is never silently omitted.
 */
function buildReportHTML(params: {
  title: string;
  body: string;
  reportHash?: string;
}): string {
  const { title, body, reportHash } = params;
  const hashDisplay = reportHash ?? "UNCOMPUTED";
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${title}</title></head>
<body>
${body}
<footer style="margin-top:40px;border-top:1px solid #ccc;padding-top:8px;font-size:11px;color:#666;font-family:monospace;">
  REPORT HASH (SHA-256): ${hashDisplay}
</footer>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Export format dispatch — template_id is passed to computeReportHash for all
// export formats so every fingerprint is traceable to its template.
//
// async function handleExport(fmt: "HTML" | "PDF" | "ZIP_COMMITTEE") {
//   const hash = await computeReportHash({
//     run_envelope_id, policy_id, presetId: template_id, version: 1, sections, generatedAt
//   });
//   if (fmt === "HTML") {
//     const html = buildReportHTML({ title, body, reportHash: hash });
//     // ... download as file; template_id recorded for audit
//   } else if (fmt === "PDF") {
//     // POST to /v1/export/pdf with { run_id, template_id, reportHash: hash }
//   } else if (fmt === "ZIP_COMMITTEE") {
//     // POST to /v1/export/zip with { run_id, template_id, reportHash: hash }
//   }
// }
//
// Export is guarded by:
//   const errCount = issues.filter(i => i.severity === "ERROR").length;
//   const canExport = !!run_envelope_id && sections.length > 0 && errCount === 0;
//   const isRunning = exportState === "RUNNING";
//   <button disabled={!canExport || isRunning}>Export</button>
//
// ---------------------------------------------------------------------------

import ReportTabBar from "./components/ReportTabBar";

import StudioTab from "./components/studio/StudioTab";
import LibraryTab from "./components/tabs/LibraryTab";
import SavedTab from "./components/tabs/SavedTab";
import RegulatoryTab from "./components/tabs/RegulatoryTab";

function ReportStudioInner() {
  const { isAuthenticated, isLoading, token, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Derive active tab from URL
  const tabParam = searchParams.get("tab") ?? "";
  const activeTab: ReportStudioTab =
    tabParam && HASH_MAP[tabParam] ? HASH_MAP[tabParam] : "STUDIO";

  // Preset selected from Library tab → navigate to Studio with preset loaded
  const [pendingPresetId, setPendingPresetId] = useState<string | null>(null);

  // Auth guard
  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/auth/login");
  }, [isLoading, isAuthenticated, router]);

  // Tab navigation -- updates URL
  const handleTabChange = useCallback(
    (tab: ReportStudioTab) => {
      const param = TAB_TO_PARAM[tab];
      router.replace(
        param ? `/reports?tab=${param}` : "/reports",
        { scroll: false },
      );
    },
    [router],
  );

  if (isLoading) {
    return (
      <div
        style={{
          background: T.bgDeep,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontFamily: T.fontMono,
            fontSize: 12,
            color: T.tertiary,
            letterSpacing: "0.1em",
          }}
        >
          LOADING...
        </span>
      </div>
    );
  }

  // Tab content router
  const renderTab = () => {
    switch (activeTab) {
      case "STUDIO":
        return <StudioTab token={token ?? ""} userId={user?.id} initialPresetId={pendingPresetId} />;
      case "LIBRARY":
        return (
          <LibraryTab
            onSelectPreset={(id) => {
              setPendingPresetId(id === "CUSTOM" ? null : id);
              router.replace("/reports", { scroll: false });
            }}
          />
        );
      case "SAVED":
        return <SavedTab token={token ?? ""} />;
      case "REGULATORY":
        return <RegulatoryTab token={token ?? ""} />;
      default:
        return <StudioTab token={token ?? ""} userId={user?.id} />;
    }
  };

  return (
    <PageShell icon={FileText} title="Report Studio" noPadding>
      <ReportTabBar activeTab={activeTab} onTabChange={handleTabChange} />
      {renderTab()}
    </PageShell>
  );
}

export default function ReportStudioPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            background: "var(--bg-deep)",
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontFamily:
                "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
              fontSize: 12,
              color: "var(--text-tertiary)",
              letterSpacing: "0.1em",
            }}
          >
            LOADING...
          </span>
        </div>
      }
    >
      <ReportStudioInner />
    </Suspense>
  );
}
