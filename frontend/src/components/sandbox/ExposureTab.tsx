"use client";

import DenseTable, { Column } from "../ui/DenseTable";
import { JsonViewer } from "../ui/XRayDrawer";
import EmptyState from "../ui/EmptyState";

interface ExposureRow {
  pair: string;
  gross: number;
  net: number;
  hedged: number;
  residual: number;
}

interface ExposureTabProps {
  tensorResult: Record<string, unknown> | undefined;
  calculateResponse: Record<string, unknown> | null;
}

export default function ExposureTab({
  tensorResult,
  calculateResponse,
}: ExposureTabProps) {
  const tensor = tensorResult;
  const calcResp = calculateResponse;

  // Build exposure rows from tensor if available
  const exposureEntries = tensor?.exposures as
    | Array<Record<string, unknown>>
    | undefined;

  if (exposureEntries && exposureEntries.length > 0) {
    const rows: ExposureRow[] = exposureEntries.map((e) => ({
      pair: String(e.currency_pair ?? e.pair ?? "—"),
      gross: Number(e.gross_exposure ?? 0),
      net: Number(e.net_exposure ?? 0),
      hedged: Number(e.hedged_amount ?? 0),
      residual: Number(e.residual ?? 0),
    }));

    const columns: Column<ExposureRow>[] = [
      {
        key: "pair",
        header: "Pair",
        render: (r) => r.pair,
        sortable: true,
        sortValue: (r) => r.pair,
      },
      {
        key: "gross",
        header: "Gross",
        render: (r) => `$${r.gross.toLocaleString()}`,
        align: "right",
        sortable: true,
        sortValue: (r) => r.gross,
      },
      {
        key: "net",
        header: "Net",
        render: (r) => `$${r.net.toLocaleString()}`,
        align: "right",
        sortable: true,
        sortValue: (r) => r.net,
      },
      {
        key: "hedged",
        header: "Hedged",
        render: (r) => `$${r.hedged.toLocaleString()}`,
        align: "right",
        sortable: true,
        sortValue: (r) => r.hedged,
      },
      {
        key: "residual",
        header: "Residual",
        render: (r) => (
          <span
            className={
              r.residual > 0
                ? "text-[var(--accent-amber)]"
                : "text-[var(--accent-green)]"
            }
          >
            ${Math.abs(r.residual).toLocaleString()}
          </span>
        ),
        align: "right",
        sortable: true,
        sortValue: (r) => r.residual,
      },
    ];

    return (
      <DenseTable
        columns={columns}
        data={rows}
        keyFn={(r) => r.pair}
        compact
      />
    );
  }

  // Fallback: show raw tensor or calculate response
  const fallbackData = tensor ?? (calcResp as Record<string, unknown> | undefined);

  if (!fallbackData) {
    return <EmptyState type="empty" message="Run a sandbox calculation to see exposure data" />;
  }

  return (
    <div className="space-y-2">
      <JsonViewer data={fallbackData} initialExpanded />
    </div>
  );
}
