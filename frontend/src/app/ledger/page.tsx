"use client";

import { useEffect, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useRouter } from "next/navigation";
import type { RootState, AppDispatch } from "../../lib/store";
import AppTopBar from "../../components/layout/AppTopBar";
import { listLedgerThunk } from "../../lib/store/slices/pipelineSlice";
import DenseTable from "../../components/ui/DenseTable";
import type { Column } from "../../components/ui/DenseTable";
import StatusChip from "../../components/ui/StatusChip";
import EmptyState from "../../components/ui/EmptyState";
import ErrorBanner from "../../components/ui/ErrorBanner";
import type { LedgerEntry } from "../../api/pipelineTypes";

export default function LedgerListPage() {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const { ledgerEntries, ledgerLoading, error } = useSelector(
    (s: RootState) => s.pipeline
  );

  useEffect(() => {
    dispatch(listLedgerThunk());
  }, [dispatch]);

  const columns: Column<LedgerEntry>[] = useMemo(
    () => [
      {
        key: "ledger_id",
        header: "Ledger ID",
        width: "140px",
        render: (r) => (
          <span className="font-mono text-[var(--accent-cyan)]">
            {r.ledger_id.slice(0, 12)}
          </span>
        ),
        sortable: true,
        sortValue: (r) => r.ledger_id,
      },
      {
        key: "order_id",
        header: "Order",
        render: (r) => <span className="font-mono">{r.order_id.slice(0, 12)}</span>,
      },
      {
        key: "replay",
        header: "Replay",
        width: "80px",
        align: "center" as const,
        render: (r) => (
          <StatusChip
            status={r.replay_verified ? "PASS" : "WARN"}
            size="sm"
          />
        ),
      },
      {
        key: "root_hash",
        header: "Root Hash",
        render: (r) => (
          <span className="font-mono text-[var(--text-tertiary)]">
            {r.root_hash.slice(0, 16)}…
          </span>
        ),
      },
      {
        key: "authorized_by",
        header: "Authorized By",
        render: (r) => r.authorized_by,
      },
      {
        key: "authorized_at",
        header: "Authorized",
        render: (r) => new Date(r.authorized_at).toLocaleString(),
        sortable: true,
        sortValue: (r) => new Date(r.authorized_at).getTime(),
      },
    ],
    []
  );

  return (
    <>
      <AppTopBar currentModule="Ledger" currentPath="/ledger" />
      <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold text-[var(--text-primary)]">
          Immutable Ledger
        </h1>
        <span className="text-[0.625rem] font-mono text-[var(--text-tertiary)] uppercase">
          {ledgerEntries.length} entries
        </span>
      </div>

      {error && <ErrorBanner code={error.code} message={error.message} />}

      {ledgerLoading ? (
        <EmptyState type="loading" message="Loading ledger…" />
      ) : ledgerEntries.length === 0 ? (
        <EmptyState
          type="empty"
          title="No ledger entries"
          message="Authorize a staged artifact to create an immutable ledger entry."
        />
      ) : (
        <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded">
          <DenseTable
            columns={columns}
            data={ledgerEntries}
            keyFn={(r) => r.ledger_id}
            onRowClick={(r) => router.push(`/ledger/${r.ledger_id}`)}
          />
        </div>
      )}
    </div>
    </>
  );
}
