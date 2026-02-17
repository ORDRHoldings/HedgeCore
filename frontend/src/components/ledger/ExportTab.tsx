"use client";

import { getLedgerExportUrl } from "../../api/pipelineClient";

interface ExportTabProps {
  ledgerId: string;
}

const EXPORT_FORMATS = ["pdf", "excel", "zip"] as const;

export default function ExportTab({ ledgerId }: ExportTabProps) {
  return (
    <div className="space-y-2">
      {EXPORT_FORMATS.map((fmt) => (
        <a
          key={fmt}
          href={getLedgerExportUrl(ledgerId, fmt)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--text-secondary)] bg-[var(--bg-sub)] border border-[var(--border-rim)] rounded hover:bg-[var(--bg-sub)]/80 transition-colors"
        >
          <span className="uppercase font-mono text-[var(--accent-cyan)]">
            {fmt}
          </span>
          <span>Download {fmt.toUpperCase()}</span>
        </a>
      ))}
    </div>
  );
}
