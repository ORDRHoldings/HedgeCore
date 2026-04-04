/**
 * HedgeWiki API Client — fetch knowledge context, formulas, and policy presets
 * from the TreasuryFX backend proxy (/api/v1/hedgewiki/*) which forwards to HedgeWiki.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== 'undefined' &&
   ['hedgecore.vercel.app', 'ordr-terminal.vercel.app'].includes(window.location.hostname)
    ? 'https://hedgecore.onrender.com/api'
    : '/api');

const WIKI_BASE = `${API_BASE}/v1/hedgewiki`;

// Simple in-memory cache for knowledge content
const _cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function getCached<T>(key: string): T | null {
  const entry = _cache.get(key);
  if (entry && Date.now() < entry.expires) return entry.data as T;
  _cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown): void {
  _cache.set(key, { data, expires: Date.now() + CACHE_TTL });
}

// ── Types ────────────────────────────────────────────────────────────

export interface KnowledgeContext {
  slug: string;
  title: string;
  nodeType: string;
  pillarId: string;
  definition?: string;
  economicIntuition?: string;
  mathematicalFramework?: string;
  riskMapping?: Record<string, string | number | boolean | null>;
  failureModes?: string[];
  governanceAccounting?: string;
  citations?: string[];
  relatedSlugs?: string[];
}

export interface WikiFormula {
  slug: string;
  title: string;
  latex?: string;
  params?: string[];
  pillar?: string;
  nodeType?: string;
}

export interface WikiPolicyPreset {
  slug: string;
  title: string;
  nodeType: string;
  riskPosture?: string;
  hedgeRatios?: { confirmed: number; forecast: number };
  content?: Record<string, unknown>;
}

// ── API Functions ────────────────────────────────────────────────────

export async function fetchKnowledgeContext(slug: string): Promise<KnowledgeContext | null> {
  const key = `ctx:${slug}`;
  const cached = getCached<KnowledgeContext>(key);
  if (cached) return cached;
  try {
    const res = await fetch(`${WIKI_BASE}/context/${slug}`);
    if (!res.ok) return null;
    const data = await res.json();
    setCache(key, data);
    return data;
  } catch {
    return null;
  }
}

export async function fetchFormulas(): Promise<WikiFormula[]> {
  const cached = getCached<WikiFormula[]>('formulas');
  if (cached) return cached;
  try {
    const res = await fetch(`${WIKI_BASE}/formulas`);
    if (!res.ok) return [];
    const data = await res.json();
    const formulas = data.formulas || [];
    setCache('formulas', formulas);
    return formulas;
  } catch {
    return [];
  }
}

export async function fetchFormula(slug: string): Promise<WikiFormula | null> {
  try {
    const res = await fetch(`${WIKI_BASE}/formulas/${slug}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchPolicyPresets(): Promise<WikiPolicyPreset[]> {
  const cached = getCached<WikiPolicyPreset[]>('presets');
  if (cached) return cached;
  try {
    const res = await fetch(`${WIKI_BASE}/policy-presets`);
    if (!res.ok) return [];
    const data = await res.json();
    const presets = data.presets || [];
    setCache('presets', presets);
    return presets;
  } catch {
    return [];
  }
}

export async function fetchComputeEffectiveness(
  periods: Array<{ periodIndex: number; hedgedItemChange: number; instrumentChange: number }>,
  config?: { standard?: string; method?: string },
): Promise<any | null> {
  try {
    const res = await fetch(`${WIKI_BASE}/compute/effectiveness`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ periods, config }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
