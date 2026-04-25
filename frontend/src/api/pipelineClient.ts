import axios from "axios";
import type {
  SandboxCalculateRequest,
  SandboxCalculateResponse,
  CreateProposalRequest,
  Proposal,
  SubmitToStagingRequest,
  StagedArtifact,
  AuthorizeRequest,
  LedgerEntry,
  ReplayLedgerRequest,
  ReplayResult,
  TimelineEvent,
} from "./pipelineTypes";

// ---------------------------------------------------------------------------
// Client instance
// ---------------------------------------------------------------------------

// Priority: NEXT_PUBLIC_API_URL env var > detect production hostname > local proxy
const _PROD_HOSTNAMES = ["hedgecore.vercel.app", "ordr-terminal.vercel.app"];
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" && _PROD_HOSTNAMES.includes(window.location.hostname)
    ? "https://hedgecore.onrender.com/api"
    : "/api");

const api = axios.create({ baseURL: `${API_BASE}/v1/pipeline` });

// Attach API key header — env var takes priority; localStorage only in development.
api.interceptors.request.use((config) => {
  let key = process.env.NEXT_PUBLIC_HEDGECALC_API_KEY ?? "";
  if (!key && process.env.NODE_ENV === "development" && typeof window !== "undefined") {
    key = localStorage.getItem("hc_api_key") ?? "";
  }
  if (key) config.headers["X-API-Key"] = key;
  return config;
});

// ---------------------------------------------------------------------------
// Auth header helper — matches dashboardClient pattern (explicit token param)
// ---------------------------------------------------------------------------

function authHeaders(token?: string) {
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
}

// ---------------------------------------------------------------------------
// Sandbox
// ---------------------------------------------------------------------------

export async function sandboxCalculate(
  req: SandboxCalculateRequest,
  token?: string,
): Promise<SandboxCalculateResponse> {
  const { data } = await api.post<SandboxCalculateResponse>(
    "/sandbox/calculate",
    req,
    authHeaders(token),
  );
  return data;
}

export async function sandboxCalculateMulti(
  req: SandboxCalculateRequest,
  pair: string,
  token?: string,
): Promise<SandboxCalculateResponse> {
  const payload = { ...req, pair };
  const { data } = await api.post<SandboxCalculateResponse>(
    "/sandbox/calculate",
    payload,
    authHeaders(token),
  );
  return { ...data, pair };
}

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

export async function createProposal(
  req: CreateProposalRequest,
  token?: string,
): Promise<Proposal> {
  const { data } = await api.post<Proposal>("/proposals", req, authHeaders(token));
  return data;
}

export async function listProposals(token?: string): Promise<Proposal[]> {
  const { data } = await api.get<Proposal[]>("/proposals", authHeaders(token));
  return data;
}

export async function getProposal(
  proposalId: string,
  token?: string,
): Promise<Proposal> {
  const { data } = await api.get<Proposal>(
    `/proposals/${proposalId}`,
    authHeaders(token),
  );
  return data;
}

// ---------------------------------------------------------------------------
// Staging
// ---------------------------------------------------------------------------

export async function submitToStaging(
  req: SubmitToStagingRequest,
  token?: string,
): Promise<StagedArtifact> {
  const { data } = await api.post<StagedArtifact>(
    `/proposals/${req.proposal_id}/submit`,
    { justification: req.justification },
    authHeaders(token),
  );
  return data;
}

export async function listStaging(
  token?: string,
  params?: { limit?: number; offset?: number; status?: string },
): Promise<StagedArtifact[]> {
  const limit = params?.limit ?? 100;
  const offset = params?.offset ?? 0;
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (params?.status) query.set("status", params.status);
  const { data } = await api.get<{ artifacts: StagedArtifact[]; total: number }>(
    `/staging?${query.toString()}`,
    authHeaders(token),
  );
  return data.artifacts ?? (data as unknown as StagedArtifact[]);
}

export async function getStaging(
  stagingId: string,
  token?: string,
): Promise<StagedArtifact> {
  const { data } = await api.get<StagedArtifact>(
    `/staging/${stagingId}`,
    authHeaders(token),
  );
  return data;
}

export async function authorizeStaged(
  req: AuthorizeRequest,
  token?: string,
): Promise<LedgerEntry> {
  const { data } = await api.post<LedgerEntry>(
    `/staging/${req.staging_id}/authorize`,
    { action: req.action, comment: req.comment },
    authHeaders(token),
  );
  return data;
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

export async function listLedger(token?: string): Promise<LedgerEntry[]> {
  const { data } = await api.get<{ entries: LedgerEntry[]; total: number }>(
    "/ledger",
    authHeaders(token),
  );
  return data.entries ?? [];
}

export async function getLedger(
  ledgerId: string,
  token?: string,
): Promise<LedgerEntry> {
  const { data } = await api.get<LedgerEntry>(
    `/ledger/${ledgerId}`,
    authHeaders(token),
  );
  return data;
}

export async function replayLedger(
  req: ReplayLedgerRequest,
  token?: string,
): Promise<ReplayResult> {
  const { data } = await api.post<ReplayResult>(
    `/ledger/${req.ledger_id}/replay`,
    undefined,
    authHeaders(token),
  );
  return data;
}

export async function getLedgerTimeline(
  ledgerId: string,
  token?: string,
): Promise<TimelineEvent[]> {
  const { data } = await api.get<TimelineEvent[]>(
    `/ledger/${ledgerId}/timeline`,
    authHeaders(token),
  );
  return data;
}

export function getLedgerExportUrl(
  ledgerId: string,
  format: "pdf" | "excel" | "zip",
): string {
  return `${API_BASE}/v1/pipeline/ledger/${ledgerId}/export/${format}`;
}
