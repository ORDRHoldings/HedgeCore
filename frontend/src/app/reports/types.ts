// -- Report Studio Types & Constants ──────────────────────────────────────────

export type ReportStudioTab =
  | "STUDIO"
  | "LIBRARY"
  | "SAVED"
  | "REGULATORY";

export interface TabDef {
  key: ReportStudioTab;
  label: string;
  param: string | null; // null = default tab (no query param)
}

export const TABS: TabDef[] = [
  { key: "STUDIO",     label: "Studio",     param: null },
  { key: "LIBRARY",    label: "Library",    param: "library" },
  { key: "SAVED",      label: "Saved",      param: "saved" },
  { key: "REGULATORY", label: "Regulatory", param: "regulatory" },
];

/** URL query param -> ReportStudioTab */
export const HASH_MAP: Record<string, ReportStudioTab> = {
  library:    "LIBRARY",
  saved:      "SAVED",
  regulatory: "REGULATORY",
};

/** ReportStudioTab -> URL query param */
export const TAB_TO_PARAM: Record<ReportStudioTab, string | null> = {
  STUDIO:     null,
  LIBRARY:    "library",
  SAVED:      "saved",
  REGULATORY: "regulatory",
};
