"use client";

import { useState, useEffect, useCallback } from "react";
import { T } from "@/lib/design/tokens";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { Download, FileCode2, FileText, FileArchive, FileDown } from "lucide-react";

interface LeiStatus {
  lei_configured:       boolean;
  reporting_entity_lei: string;
}

interface Props {
  token: string;
}

interface RunOption {
  id: string;
  label: string;
}

interface FormatCard {
  id: string;
  title: string;
  description: string;
  format: string;
  formatColor: string;
  endpoint: (runId: string) => string;
  filename: (runId: string) => string;
  icon: typeof FileCode2;
}

const FORMAT_CARDS: FormatCard[] = [
  {
    id: "emir",
    title: "EMIR Article 9",
    description: "European Market Infrastructure Regulation trade reporting",
    format: "XML",
    formatColor: T.accent,
    endpoint: (runId) => `/v1/reports/${runId}/emir`,
    filename: (runId) => `emir-article9-${runId.slice(0, 8)}.xml`,
    icon: FileCode2,
  },
  {
    id: "mifid",
    title: "MiFID II RTS 25",
    description: "Markets in Financial Instruments Directive transaction reporting",
    format: "XML",
    formatColor: T.accent,
    endpoint: (runId) => `/v1/reports/${runId}/mifid`,
    filename: (runId) => `mifid2-rts25-${runId.slice(0, 8)}.xml`,
    icon: FileCode2,
  },
  {
    id: "dodd-frank",
    title: "Dodd-Frank Title VII",
    description: "Swap data repository reporting for OTC derivatives",
    format: "TXT",
    formatColor: T.warn,
    endpoint: (runId) => `/v1/reports/${runId}/dodd-frank`,
    filename: (runId) => `dodd-frank-title7-${runId.slice(0, 8)}.txt`,
    icon: FileText,
  },
  {
    id: "bank-pdf",
    title: "Bank Compliance PDF",
    description: "Formatted compliance report for bank counterparty submissions",
    format: "PDF",
    formatColor: T.fail,
    endpoint: (runId) => `/v1/reports/${runId}/bank-pdf`,
    filename: (runId) => `bank-compliance-${runId.slice(0, 8)}.pdf`,
    icon: FileDown,
  },
  {
    id: "audit-zip",
    title: "Audit ZIP Bundle",
    description: "Complete audit evidence bundle with all supporting documents",
    format: "ZIP",
    formatColor: T.pass,
    endpoint: (runId) => `/v1/export/zip/${runId}`,
    filename: (runId) => `audit-bundle-${runId.slice(0, 8)}.zip`,
    icon: FileArchive,
  },
];

export default function RegulatoryTab({ token }: Props) {
  const [runs, setRuns] = useState<RunOption[]>([]);
  const [selectedRun, setSelectedRun] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [leiStatus, setLeiStatus] = useState<LeiStatus | null>(null);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dashboardFetch("/v1/runs?limit=50", token);
      if (res.ok) {
        const data = await res.json();
        const items: Array<{ run_id?: string; id?: string; created_at?: string }> =
          Array.isArray(data) ? data : data.items ?? [];
        setRuns(
          items.map((r) => {
            const id = r.run_id ?? r.id ?? "";
            const date = r.created_at
              ? new Date(r.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "";
            return {
              id,
              label: `${id.slice(0, 8)}${date ? ` - ${date}` : ""}`,
            };
          }),
        );
      }
    } catch {
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchLeiStatus = useCallback(async () => {
    try {
      const res = await dashboardFetch("/v1/settings/regulatory", token);
      if (res.ok) {
        const d = await res.json() as LeiStatus;
        setLeiStatus(d);
      }
    } catch {
      // silent — show nothing on failure
    }
  }, [token]);

  useEffect(() => {
    fetchRuns();
    fetchLeiStatus();
  }, [fetchRuns, fetchLeiStatus]);

  const handleDownload = async (card: FormatCard) => {
    if (!selectedRun) return;
    setDownloading(card.id);
    try {
      const res = await dashboardFetch(card.endpoint(selectedRun), token);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = card.filename(selectedRun);
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch {
      // silently handle
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div style={{ padding: 24, background: T.bgDeep, minHeight: "60vh" }}>

      {/* LEI status banner */}
      {leiStatus !== null && (
        leiStatus.lei_configured ? (
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 20,
            padding: "5px 12px",
            borderRadius: 3,
            border: `1px solid ${T.pass}40`,
            background: `color-mix(in srgb, ${T.pass} 8%, transparent)`,
          }}>
            <span style={{ fontFamily: T.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: T.pass }}>
              ✓ LEI CONFIGURED
            </span>
            <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.secondary }}>
              {leiStatus.reporting_entity_lei.slice(0, 8)}...
            </span>
          </div>
        ) : (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 20,
            padding: "10px 14px",
            borderRadius: 3,
            border: `1px solid ${T.warn}`,
            borderLeft: `3px solid ${T.warn}`,
            background: `color-mix(in srgb, ${T.warn} 8%, transparent)`,
            fontFamily: T.fontUI,
            fontSize: 12,
            color: T.primary,
          }}>
            <span style={{ fontFamily: T.fontMono, fontWeight: 700, color: T.warn }}>⚠</span>
            LEI not configured — exports will use NOT_PROVIDED placeholder. Configure in{" "}
            <a
              href="/settings?tab=regulatory"
              style={{ color: T.accent, textDecoration: "underline", cursor: "pointer" }}
            >
              Settings → Regulatory
            </a>.
          </div>
        )
      )}

      {/* Run selector */}
      <div style={{ marginBottom: 24, maxWidth: 420 }}>
        <label
          style={{
            display: "block",
            fontFamily: T.fontMono,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: T.tertiary,
            marginBottom: 8,
          }}
        >
          SELECT CALCULATION RUN
        </label>
        <select
          value={selectedRun}
          onChange={(e) => setSelectedRun(e.target.value)}
          disabled={loading}
          style={{
            width: "100%",
            fontFamily: T.fontMono,
            fontSize: 13,
            color: T.primary,
            background: T.bgPanel,
            border: `1px solid ${T.rim}`,
            borderRadius: 6,
            padding: "10px 14px",
            outline: "none",
            cursor: "pointer",
            appearance: "auto",
          }}
        >
          <option value="">
            {loading ? "Loading runs..." : "-- Select a run --"}
          </option>
          {runs.map((run) => (
            <option key={run.id} value={run.id}>
              {run.label}
            </option>
          ))}
        </select>
      </div>

      {/* Format cards grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 16,
        }}
      >
        {FORMAT_CARDS.map((card) => {
          const isHovered = hoveredCard === card.id;
          const isDisabled = !selectedRun;
          const isDownloading = downloading === card.id;
          const CardIcon = card.icon;

          return (
            <div
              key={card.id}
              onMouseEnter={() => setHoveredCard(card.id)}
              onMouseLeave={() => setHoveredCard(null)}
              style={{
                background: T.bgPanel,
                border: `1px solid ${isHovered && !isDisabled ? T.accent : T.rim}`,
                borderRadius: 6,
                padding: 20,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                transition: "border-color 0.15s",
                opacity: isDisabled ? 0.6 : 1,
              }}
            >
              {/* Icon + format badge row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <CardIcon size={20} color={T.secondary} />
                <span
                  style={{
                    fontFamily: T.fontMono,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    color: card.formatColor,
                    background: T.bgSub,
                    border: `1px solid ${T.soft}`,
                    borderRadius: 3,
                    padding: "3px 8px",
                  }}
                >
                  {card.format}
                </span>
              </div>

              {/* Title */}
              <span
                style={{
                  fontFamily: T.fontUI,
                  fontSize: 14,
                  fontWeight: 700,
                  color: T.primary,
                }}
              >
                {card.title}
              </span>

              {/* Description */}
              <span
                style={{
                  fontFamily: T.fontUI,
                  fontSize: 12,
                  color: T.secondary,
                  lineHeight: 1.5,
                }}
              >
                {card.description}
              </span>

              {/* Download button */}
              <button
                onClick={() => handleDownload(card)}
                disabled={isDisabled || isDownloading}
                style={{
                  marginTop: "auto",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  fontFamily: T.fontMono,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: isDisabled ? T.disabled : T.primary,
                  background: isDisabled ? T.bgSub : T.bgSub,
                  border: `1px solid ${isDisabled ? T.soft : T.rim}`,
                  borderRadius: 4,
                  padding: "8px 16px",
                  cursor: isDisabled ? "not-allowed" : "pointer",
                }}
              >
                <Download size={13} />
                {isDownloading ? "DOWNLOADING..." : "DOWNLOAD"}
              </button>
            </div>
          );
        })}
      </div>

      {/* Disclaimer */}
      <div
        style={{
          marginTop: 24,
          fontFamily: T.fontMono,
          fontSize: 11,
          color: T.tertiary,
          letterSpacing: "0.02em",
          lineHeight: 1.6,
          maxWidth: 600,
        }}
      >
        Regulatory reports are generated from deterministic calculation runs.
        These documents are for internal compliance workflows and do not
        constitute legal or regulatory advice.
      </div>
    </div>
  );
}
