"use client";

import { useEffect, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useRouter } from "next/navigation";
import type { RootState, AppDispatch } from "../../lib/store";
import AppTopBar from "../../components/layout/AppTopBar";
import { listStagingThunk } from "../../lib/store/slices/pipelineSlice";
import DenseTable from "../../components/ui/DenseTable";
import type { Column } from "../../components/ui/DenseTable";
import StatusChip from "../../components/ui/StatusChip";
import type { ChipStatus } from "../../components/ui/StatusChip";
import EmptyState from "../../components/ui/EmptyState";
import ErrorBanner from "../../components/ui/ErrorBanner";
import type { StagedArtifact } from "../../api/pipelineTypes";

export default function StagingListPage() {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const { stagingArtifacts, stagingLoading, error } = useSelector(
    (s: RootState) => s.pipeline
  );

  useEffect(() => {
    dispatch(listStagingThunk());
  }, [dispatch]);

  const columns: Column<StagedArtifact>[] = useMemo(
    () => [
      {
        key: "staging_id",
        header: "Staging ID",
        width: "140px",
        render: (r) => (
          <span className="font-mono text-[var(--accent-cyan)]">
            {r.staging_id.slice(0, 12)}
          </span>
        ),
        sortable: true,
        sortValue: (r) => r.staging_id,
      },
      {
        key: "proposal_id",
        header: "Proposal",
        render: (r) => (
          <span className="font-mono">{r.proposal_id.slice(0, 12)}</span>
        ),
      },
      {
        key: "status",
        header: "Status",
        width: "100px",
        align: "center" as const,
        render: (r) => (
          <StatusChip status={r.authorization_status as ChipStatus} size="sm" />
        ),
      },
      {
        key: "integrity",
        header: "Integrity",
        width: "80px",
        align: "right" as const,
        render: (r) => (
          <span className="tabular-nums">{r.integrity_score}/100</span>
        ),
        sortable: true,
        sortValue: (r) => r.integrity_score,
      },
      {
        key: "approvals",
        header: "Approvals",
        width: "90px",
        align: "center" as const,
        render: (r) => (
          <span className="tabular-nums">
            {r.approvals.length}/{r.required_approvals}
          </span>
        ),
      },
      {
        key: "submitted_by",
        header: "Submitter",
        render: (r) => r.submitted_by,
      },
      {
        key: "submitted_at",
        header: "Submitted",
        render: (r) => new Date(r.submitted_at).toLocaleString(),
        sortable: true,
        sortValue: (r) => new Date(r.submitted_at).getTime(),
      },
    ],
    []
  );

  return (
    <>
      <AppTopBar currentModule="Staging" currentPath="/staging" />
      <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold text-[var(--text-primary)]">
          Staging Queue
        </h1>
        <span className="text-[0.625rem] font-mono text-[var(--text-tertiary)] uppercase">
          {stagingArtifacts.length} artifacts
        </span>
      </div>

      {error && <ErrorBanner code={error.code} message={error.message} />}

      {stagingLoading ? (
        <EmptyState type="loading" message="Loading staging queue…" />
      ) : stagingArtifacts.length === 0 ? (
        <EmptyState
          type="empty"
          title="No staged artifacts"
          message="Submit a proposal from the Sandbox to create a staged artifact."
        />
      ) : (
        <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded">
          <DenseTable
            columns={columns}
            data={stagingArtifacts}
            keyFn={(r) => r.staging_id}
            onRowClick={(r) => router.push(`/staging/${r.staging_id}`)}
          />
        </div>
      )}
    </div>
    </>
  );
}
