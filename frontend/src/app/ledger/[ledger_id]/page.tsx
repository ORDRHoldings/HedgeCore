"use client";

import { useEffect, useCallback } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useParams } from "next/navigation";
import { useAuth } from "../../../lib/authContext";
import type { RootState, AppDispatch } from "../../../lib/store";
import {
  getLedgerThunk,
  replayLedgerThunk,
  getTimelineThunk,
  setXRayOpen,
} from "../../../lib/store/slices/pipelineSlice";
import KpiTile from "../../../components/ui/KpiTile";
import RailTabs from "../../../components/ui/RailTabs";
import XRayDrawer, { JsonViewer } from "../../../components/ui/XRayDrawer";
import EmptyState from "../../../components/ui/EmptyState";
import ErrorBanner from "../../../components/ui/ErrorBanner";

// Ledger components
import ReplayEngine from "../../../components/ledger/ReplayEngine";
import TimelineTab from "../../../components/ledger/TimelineTab";
import ExportTab from "../../../components/ledger/ExportTab";
import ProvenanceTab from "../../../components/ledger/ProvenanceTab";
import AnchorTab from "../../../components/ledger/AnchorTab";

import { PageShell } from "@/components/layout/PageShell";
import { Globe } from "lucide-react";

export default function LedgerDetailPage() {
  const params = useParams<{ ledger_id: string }>();
  const ledger_id = params?.ledger_id ?? "";
  const dispatch = useDispatch<AppDispatch>();
  const { token } = useAuth();
  const {
    currentLedger,
    ledgerLoading,
    replayResult,
    replayLoading,
    timeline,
    xrayOpen,
    error,
  } = useSelector((s: RootState) => s.pipeline);

  useEffect(() => {
    if (ledger_id && token) {
      dispatch(getLedgerThunk({ ledgerId: ledger_id, token }));
      dispatch(getTimelineThunk({ ledgerId: ledger_id, token }));
    }
  }, [dispatch, ledger_id, token]);

  const handleReplay = useCallback(() => {
    if (!ledger_id || !token) return;
    dispatch(replayLedgerThunk({ request: { ledger_id }, token }));
  }, [dispatch, ledger_id, token]);

  if (!params || !params.ledger_id) {
    return <div className="text-center py-20 text-[var(--text-secondary)]">Loading...</div>;
  }

  if (ledgerLoading || !currentLedger) {
    return (

    
      <div className="p-8">
        <EmptyState type="loading" message="Loading ledger entry…" />
      </div>
    
    
    );
  }

  const l = currentLedger;

  return (
    <PageShell icon={Globe} title="Ledger Detail" breadcrumb={["Dashboard", "Ledger", "Detail"]} noPadding>

    <div className="h-full flex">
      {/* Left Rail */}
      <aside className="w-[25%] min-w-[260px] border-r border-[var(--border-rim)] bg-[var(--bg-panel)] overflow-auto">
        <RailTabs
          tabs={[
            {
              id: "timeline",
              label: "Timeline",
              content: <TimelineTab timeline={timeline} />,
            },
            {
              id: "exports",
              label: "Exports",
              content: <ExportTab ledgerId={ledger_id} />,
            },
          ]}
        />
      </aside>

      {/* Hero */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {error && <ErrorBanner code={error.code} message={error.message} />}

        <div className="grid grid-cols-4 gap-3">
          <KpiTile
            label="Replay"
            value={l.replay_verified ? "VERIFIED" : "PENDING"}
            deltaDirection={l.replay_verified ? "positive" : "neutral"}
          />
          <KpiTile label="Root Hash" value={l.root_hash.slice(0, 12) + "…"} />
          <KpiTile label="Order" value={l.order_id.slice(0, 12)} />
          <KpiTile label="Authorized" value={new Date(l.authorized_at).toLocaleDateString()} />
        </div>

        <ReplayEngine
          replayResult={replayResult}
          replayLoading={replayLoading}
          onRunReplay={handleReplay}
        />
      </div>

      {/* Right Rail */}
      <aside className="w-[25%] min-w-[260px] border-l border-[var(--border-rim)] bg-[var(--bg-panel)] overflow-auto">
        <RailTabs
          tabs={[
            {
              id: "provenance",
              label: "Provenance",
              content: <ProvenanceTab ledger={l} />,
            },
            {
              id: "anchor",
              label: "Anchor",
              content: <AnchorTab ledger={l} />,
            },
          ]}
        />
      </aside>

      {/* X-Ray */}
      <XRayDrawer
        open={xrayOpen}
        onClose={() => dispatch(setXRayOpen(false))}
        title="Ledger X-Ray"
        tabs={[
          { id: "entry", label: "Full Entry", content: <JsonViewer data={currentLedger} initialExpanded /> },
          { id: "freeze", label: "Freeze Artifact", content: <JsonViewer data={l.freeze_artifact ?? {}} initialExpanded /> },
          { id: "replay", label: "Replay", content: <JsonViewer data={replayResult ?? {}} initialExpanded /> },
        ]}
      />
    </div>
  
    </PageShell>
  );
}
