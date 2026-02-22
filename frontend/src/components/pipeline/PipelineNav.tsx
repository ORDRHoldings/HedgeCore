"use client";

import { useSelector, useDispatch } from "react-redux";
import { useRouter, usePathname } from "next/navigation";
import type { RootState, AppDispatch } from "../../lib/store";
import { setActiveState } from "../../lib/store/slices/pipelineSlice";

type PipelineStage = "SANDBOX" | "STAGING" | "LEDGER";

interface StageConfig {
  key: PipelineStage;
  label: string;
  subtitle: string;
  path: string;
  color: string;
  bgActive: string;
  enabled: boolean;
}

const STAGES: StageConfig[] = [
  {
    key: "SANDBOX",
    label: "Simulate",
    subtitle: "Sim Engine",
    path: "/sandbox",
    color: "text-[var(--text-secondary)]",
    bgActive: "bg-[var(--bg-sub)]",
    enabled: true,
  },
  {
    key: "STAGING",
    label: "Review",
    subtitle: "Staging",
    path: "/staging",
    color: "text-[var(--accent-amber)]",
    bgActive: "bg-[var(--accent-amber)]/10",
    enabled: false,
  },
  {
    key: "LEDGER",
    label: "Commit",
    subtitle: "Ledger",
    path: "/ledger",
    color: "text-[var(--accent-cyan)]",
    bgActive: "bg-[var(--accent-cyan)]/10",
    enabled: false,
  },
];

export default function PipelineNav() {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const pathname = usePathname();
  const { activeState } = useSelector((s: RootState) => s.pipeline);

  const handleClick = (stage: StageConfig) => {
    if (!stage.enabled) return;
    dispatch(setActiveState(stage.key));
    router.push(stage.path);
  };

  return (
    <nav className="h-12 bg-[var(--bg-panel)] border-b border-[var(--border-rim)] flex items-center px-4 gap-1 shrink-0">
      {STAGES.map((stage, i) => {
        const isActive =
          pathname?.startsWith(stage.path) || activeState === stage.key;
        const isDisabled = !stage.enabled;

        return (
          <div key={stage.key} className="flex items-center">
            {i > 0 && (
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className="mx-1 text-[var(--border-rim)]"
              >
                <path
                  d="M6 3l5 5-5 5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            <button
              onClick={() => handleClick(stage)}
              disabled={isDisabled}
              title={isDisabled ? `${stage.label} (${stage.subtitle}) — coming soon` : undefined}
              className={[
                "px-3 py-1.5 rounded text-xs font-medium transition-colors",
                isDisabled
                  ? "text-[var(--text-tertiary)]/40 cursor-not-allowed opacity-40"
                  : isActive
                    ? `${stage.bgActive} ${stage.color}`
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-sub)]/50",
              ].join(" ")}
            >
              <span className="flex flex-col items-center leading-none gap-0.5">
                <span>{stage.label}</span>
                <span className="text-[0.5rem] opacity-50 font-normal tracking-wider uppercase">{stage.subtitle}</span>
              </span>
            </button>
          </div>
        );
      })}

      {/* Active state indicator */}
      <div className="flex-1" />
      <span className="text-[0.625rem] font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
        {STAGES.find(s => s.key === activeState)?.label ?? activeState}
      </span>
    </nav>
  );
}
