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
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" && window.location.hostname === "hedgecore.vercel.app"
    ? "https://hedgecore.onrender.com/api"
    : "/api");

const api = axios.create({ baseURL: `${API_BASE}/v1/pipeline` });

// Attach API key header for dev mode
api.interceptors.request.use((config) => {
  const key =
    typeof window !== "undefined"
      ? localStorage.getItem("hc_api_key") ?? "HC_DEV_KEY_001"
      : "HC_DEV_KEY_001";
  config.headers["X-API-Key"] = key;
  return config;
});

// ---------------------------------------------------------------------------
// Sandbox
// ---------------------------------------------------------------------------

export async function sandboxCalculate(
  req: SandboxCalculateRequest
): Promise<SandboxCalculateResponse> {
  const { data } = await api.post<SandboxCalculateResponse>(
    "/sandbox/calculate",
    req
  );
  return data;
}

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

export async function createProposal(
  req: CreateProposalRequest
): Promise<Proposal> {
  const { data } = await api.post<Proposal>("/proposals", req);
  return data;
}

export async function listProposals(): Promise<Proposal[]> {
  const { data } = await api.get<Proposal[]>("/proposals");
  return data;
}

export async function getProposal(proposalId: string): Promise<Proposal> {
  const { data } = await api.get<Proposal>(`/proposals/${proposalId}`);
  return data;
}

// ---------------------------------------------------------------------------
// Staging
// ---------------------------------------------------------------------------

export async function submitToStaging(
  req: SubmitToStagingRequest
): Promise<StagedArtifact> {
  const { data } = await api.post<StagedArtifact>(
    `/proposals/${req.proposal_id}/submit`,
    { justification: req.justification }
  );
  return data;
}

export async function listStaging(): Promise<StagedArtifact[]> {
  const { data } = await api.get<StagedArtifact[]>("/staging");
  return data;
}

export async function getStaging(stagingId: string): Promise<StagedArtifact> {
  const { data } = await api.get<StagedArtifact>(`/staging/${stagingId}`);
  return data;
}

export async function authorizeStaged(
  req: AuthorizeRequest
): Promise<LedgerEntry> {
  const { data } = await api.post<LedgerEntry>(
    `/staging/${req.staging_id}/authorize`,
    { action: req.action, comment: req.comment }
  );
  return data;
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

export async function listLedger(): Promise<LedgerEntry[]> {
  const { data } = await api.get<LedgerEntry[]>("/ledger");
  return data;
}

export async function getLedger(ledgerId: string): Promise<LedgerEntry> {
  const { data } = await api.get<LedgerEntry>(`/ledger/${ledgerId}`);
  return data;
}

export async function replayLedger(
  req: ReplayLedgerRequest
): Promise<ReplayResult> {
  const { data } = await api.post<ReplayResult>(
    `/ledger/${req.ledger_id}/replay`
  );
  return data;
}

export async function getLedgerTimeline(
  ledgerId: string
): Promise<TimelineEvent[]> {
  const { data } = await api.get<TimelineEvent[]>(
    `/ledger/${ledgerId}/timeline`
  );
  return data;
}

export function getLedgerExportUrl(
  ledgerId: string,
  format: "pdf" | "excel" | "zip"
): string {
  return `${API_BASE}/v1/pipeline/ledger/${ledgerId}/export/${format}`;
}
