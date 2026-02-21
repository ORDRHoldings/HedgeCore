"use client";

import { useEffect, useCallback } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useParams } from "next/navigation";
import { useAuth } from "../../../lib/authContext";
import type { RootState, AppDispatch } from "../../../lib/store";
import {
  getStagingThunk,
  authorizeStagedThunk,
  setXRayOpen,
} from "../../../lib/store/slices/pipelineSlice";
import type { ApprovalAction } from "../../../api/pipelineTypes";
import KpiTile from "../../../components/ui/KpiTile";
import RailTabs from "../../../components/ui/RailTabs";
import XRayDrawer, { JsonViewer } from "../../../components/ui/XRayDrawer";
import EmptyState from "../../../components/ui/EmptyState";
import ErrorBanner from "../../../components/ui/ErrorBanner";

// Staging components
import FrozenArtifactTab from "../../../components/staging/FrozenArtifactTab";
import PolicyLockTab from "../../../components/staging/PolicyLockTab";
import AuthorizationTab from "../../../components/staging/AuthorizationTab";
import ChecklistTab from "../../../components/staging/ChecklistTab";
import ApprovalRecordsList from "../../../components/staging/ApprovalRecordsList";

export default function StagingDetailPage() {
  const params = useParams<{ staging_id: string }>();
  if (!params || !params.staging_id) {
    return <div className="text-center py-20 text-[var(--text-secondary)]">Loading...</div>;
  }
  const staging_id = params.staging_id;
  const dispatch = useDispatch<AppDispatch>();
  const { token } = useAuth();
  const { currentStaging, stagingLoading, xrayOpen, error } = useSelector(
    (s: RootState) => s.pipeline
  );

  useEffect(() => {
    if (staging_id && token) dispatch(getStagingThunk({ stagingId: staging_id, token }));
  }, [dispatch, staging_id, token]);

  const handleAuthorize = useCallback(
    (action: ApprovalAction, comment: string) => {
      if (!staging_id || !token) return;
      dispatch(
        authorizeStagedThunk({
          request: {
            staging_id,
            action,
            comment: comment || undefined,
          },
          token,
        })
      );
    },
    [dispatch, staging_id, token]
  );

  if (stagingLoading || !currentStaging) {
    return (
      <div className="p-8">
        <EmptyState type="loading" message="Loading staged artifact…" />
      </div>
    );
  }

  const s = currentStaging;

  return (
    <div className="h-full flex">
      {/* Left Rail */}
      <aside className="w-[25%] min-w-[260px] border-r border-[var(--border-rim)] bg-[var(--bg-panel)] overflow-auto">
        <RailTabs
          tabs={[
            {
              id: "frozen",
              label: "Frozen Artifact",
              content: <FrozenArtifactTab staging={s} />,
            },
            {
              id: "policy",
              label: "Policy Lock",
              content: <PolicyLockTab />,
            },
          ]}
        />
      </aside>

      {/* Hero */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {error && <ErrorBanner code={error.code} message={error.message} />}

        <div className="grid grid-cols-4 gap-3">
          <KpiTile label="Integrity Score" value={`${s.integrity_score}/100`} />
          <KpiTile label="Status" value={s.authorization_status} />
          <KpiTile label="Approvals" value={`${s.approvals.length}/${s.required_approvals}`} />
          <KpiTile label="Submitted" value={new Date(s.submitted_at).toLocaleDateString()} />
        </div>

        <ApprovalRecordsList approvals={s.approvals} />
      </div>

      {/* Right Rail */}
      <aside className="w-[25%] min-w-[260px] border-l border-[var(--border-rim)] bg-[var(--bg-panel)] overflow-auto">
        <RailTabs
          tabs={[
            {
              id: "authorize",
              label: "Authorization",
              content: (
                <AuthorizationTab
                  onAuthorize={handleAuthorize}
                  loading={stagingLoading}
                  requiredApprovals={s.required_approvals}
                  currentApprovals={s.approvals.length}
                />
              ),
            },
            {
              id: "checklist",
              label: "Checklist",
              content: <ChecklistTab />,
            },
          ]}
        />
      </aside>

      {/* X-Ray */}
      <XRayDrawer
        open={xrayOpen}
        onClose={() => dispatch(setXRayOpen(false))}
        title="Governance X-Ray"
        tabs={[
          { id: "audit", label: "Audit", content: <JsonViewer data={currentStaging} initialExpanded /> },
          { id: "approvals", label: "Approvals", content: <JsonViewer data={s.approvals} initialExpanded /> },
        ]}
      />
    </div>
  );
}
