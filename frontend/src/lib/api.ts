import axios from "axios";
import type {
  HedgeRequest,
  HedgeRunResponse,
  EngineCatalog,
  EngineRecommendation,
  EngineSimulation,
} from "./types";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "/api",
  headers: {
    "Content-Type": "application/json",
    ...(process.env.NEXT_PUBLIC_API_KEY ? { "X-API-Key": process.env.NEXT_PUBLIC_API_KEY } : {}),
  },
});

// Full deterministic engine endpoint
export async function runHedge(request: HedgeRequest): Promise<HedgeRunResponse> {
  const { data } = await api.post<HedgeRunResponse>("/hedge/run", request);
  return data;
}

// Demo engine endpoints
export async function getEngineCatalog(): Promise<EngineCatalog> {
  const { data } = await api.get<EngineCatalog>("/engine/catalog");
  return data;
}

export async function simulateEngine(
  payload: Record<string, unknown>
): Promise<EngineSimulation> {
  const { data } = await api.post<EngineSimulation>("/engine/simulate", payload);
  return data;
}

export async function recommendEngine(
  payload: Record<string, unknown>
): Promise<EngineRecommendation> {
  const { data } = await api.post<EngineRecommendation>("/engine/recommend", payload);
  return data;
}

export async function checkHealth(): Promise<{ status: string; service: string }> {
  const { data } = await api.get("/health");
  return data;
}

export default api;
