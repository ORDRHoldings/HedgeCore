/**
 * HedgeWiki API Client Tests
 *
 * Tests for src/lib/hedgewiki.ts — the API client that fetches knowledge
 * context, formulas, and policy presets from the TreasuryFX backend proxy.
 *
 * Key concerns:
 * - Correct URL construction and fetch calls
 * - Proper error handling (network errors, non-OK responses)
 * - In-memory cache behavior (hit, miss, TTL expiry)
 * - POST body structure for compute endpoints
 */

// ---------------------------------------------------------------------------
// Module-level cache lives inside hedgewiki.ts as a Map. Because Jest caches
// modules between tests in the same file, we use `jest.isolateModules` or
// re-import to get a fresh cache when needed. For most tests we import once
// and accept shared cache, then use a dedicated describe block for cache
// behavior where we isolate the module.
// ---------------------------------------------------------------------------

// Mock window.location.hostname before the module is imported so the
// API_BASE branch that checks `window.location.hostname` can be evaluated.
// The jest config uses testEnvironment: "node" which has no `window`, so we
// define just enough for the module's guard to work.
Object.defineProperty(globalThis, 'window', {
  value: { location: { hostname: 'localhost' } },
  writable: true,
});

// Now import — API_BASE will resolve to "/api" (localhost fallback).
import {
  fetchKnowledgeContext,
  fetchFormulas,
  fetchFormula,
  fetchPolicyPresets,
  fetchComputeEffectiveness,
  type KnowledgeContext,
  type WikiFormula,
  type WikiPolicyPreset,
} from '@/lib/hedgewiki';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WIKI_BASE = '/api/v1/hedgewiki';

/** Build a minimal successful Response. */
function okResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/** Build a non-OK Response (e.g. 404, 500). */
function errorResponse(status: number): Response {
  return {
    ok: false,
    status,
    statusText: status === 404 ? 'Not Found' : 'Internal Server Error',
    json: () => Promise.resolve({ error: 'fail' }),
  } as unknown as Response;
}

/** Sample KnowledgeContext payload. */
const sampleContext: KnowledgeContext = {
  slug: 'forward-contract',
  title: 'Forward Contract',
  nodeType: 'Instrument',
  pillarId: 'instruments',
  definition: 'A binding agreement to exchange currencies at a future date.',
  economicIntuition: 'Locks in exchange rate, eliminating downside at the cost of upside.',
  failureModes: ['Counterparty default', 'Basis risk'],
  citations: ['Hull, Options Futures & Other Derivatives'],
  relatedSlugs: ['ndf', 'fx-swap'],
};

/** Sample WikiFormula payload. */
const sampleFormula: WikiFormula = {
  slug: 'black-scholes',
  title: 'Black-Scholes',
  latex: 'C = S N(d_1) - K e^{-rT} N(d_2)',
  params: ['S', 'K', 'r', 'T', 'sigma'],
  pillar: 'pricing',
  nodeType: 'Model',
};

/** Sample WikiPolicyPreset payload. */
const samplePreset: WikiPolicyPreset = {
  slug: 'conservative-treasury',
  title: 'Conservative Treasury',
  nodeType: 'Policy',
  riskPosture: 'conservative',
  hedgeRatios: { confirmed: 1.0, forecast: 0.75 },
};

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let fetchSpy: jest.SpiedFunction<typeof global.fetch>;

beforeEach(() => {
  fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(okResponse({}));
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. fetchKnowledgeContext
// ═══════════════════════════════════════════════════════════════════════════

describe('fetchKnowledgeContext', () => {
  test('returns data on success', async () => {
    fetchSpy.mockResolvedValueOnce(okResponse(sampleContext));

    const result = await fetchKnowledgeContext('forward-contract');

    expect(result).toEqual(sampleContext);
    expect(fetchSpy).toHaveBeenCalledWith(`${WIKI_BASE}/context/forward-contract`);
  });

  test('returns null on network error', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await fetchKnowledgeContext('network-fail');

    expect(result).toBeNull();
  });

  test('returns null on non-OK response (404)', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(404));

    const result = await fetchKnowledgeContext('nonexistent');

    expect(result).toBeNull();
  });

  test('returns null on non-OK response (500)', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(500));

    const result = await fetchKnowledgeContext('server-error-slug');

    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. fetchFormulas
// ═══════════════════════════════════════════════════════════════════════════

describe('fetchFormulas', () => {
  // fetchFormulas uses a fixed cache key ('formulas'), so each test must
  // isolate the module to avoid cache pollution from prior tests.

  test('returns formulas array from response', async () => {
    await jest.isolateModulesAsync(async () => {
      const mod = await import('@/lib/hedgewiki');
      const spy = jest.spyOn(global, 'fetch')
        .mockResolvedValueOnce(okResponse({ formulas: [sampleFormula] }));

      const result = await mod.fetchFormulas();

      expect(result).toEqual([sampleFormula]);
      expect(spy).toHaveBeenCalledWith(`${WIKI_BASE}/formulas`);
      spy.mockRestore();
    });
  });

  test('returns empty array when response has no formulas key', async () => {
    await jest.isolateModulesAsync(async () => {
      const mod = await import('@/lib/hedgewiki');
      const spy = jest.spyOn(global, 'fetch')
        .mockResolvedValueOnce(okResponse({}));

      const result = await mod.fetchFormulas();

      expect(result).toEqual([]);
      spy.mockRestore();
    });
  });

  test('returns empty array on network error', async () => {
    await jest.isolateModulesAsync(async () => {
      const mod = await import('@/lib/hedgewiki');
      const spy = jest.spyOn(global, 'fetch')
        .mockRejectedValueOnce(new Error('Network down'));

      const result = await mod.fetchFormulas();

      expect(result).toEqual([]);
      spy.mockRestore();
    });
  });

  test('returns empty array on non-OK response', async () => {
    await jest.isolateModulesAsync(async () => {
      const mod = await import('@/lib/hedgewiki');
      const spy = jest.spyOn(global, 'fetch')
        .mockResolvedValueOnce(errorResponse(500));

      const result = await mod.fetchFormulas();

      expect(result).toEqual([]);
      spy.mockRestore();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. fetchFormula
// ═══════════════════════════════════════════════════════════════════════════

describe('fetchFormula', () => {
  test('returns formula object on success', async () => {
    fetchSpy.mockResolvedValueOnce(okResponse(sampleFormula));

    const result = await fetchFormula('black-scholes');

    expect(result).toEqual(sampleFormula);
    expect(fetchSpy).toHaveBeenCalledWith(`${WIKI_BASE}/formulas/black-scholes`);
  });

  test('returns null on 404', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(404));

    const result = await fetchFormula('nonexistent-formula');

    expect(result).toBeNull();
  });

  test('returns null on network error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Connection refused'));

    const result = await fetchFormula('unreachable-formula');

    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. fetchPolicyPresets
// ═══════════════════════════════════════════════════════════════════════════

describe('fetchPolicyPresets', () => {
  // fetchPolicyPresets uses a fixed cache key ('presets'), so each test must
  // isolate the module to avoid cache pollution from prior tests.

  test('returns presets array from response', async () => {
    await jest.isolateModulesAsync(async () => {
      const mod = await import('@/lib/hedgewiki');
      const spy = jest.spyOn(global, 'fetch')
        .mockResolvedValueOnce(okResponse({ presets: [samplePreset] }));

      const result = await mod.fetchPolicyPresets();

      expect(result).toEqual([samplePreset]);
      expect(spy).toHaveBeenCalledWith(`${WIKI_BASE}/policy-presets`);
      spy.mockRestore();
    });
  });

  test('returns empty array when response has no presets key', async () => {
    await jest.isolateModulesAsync(async () => {
      const mod = await import('@/lib/hedgewiki');
      const spy = jest.spyOn(global, 'fetch')
        .mockResolvedValueOnce(okResponse({}));

      const result = await mod.fetchPolicyPresets();

      expect(result).toEqual([]);
      spy.mockRestore();
    });
  });

  test('returns empty array on network error', async () => {
    await jest.isolateModulesAsync(async () => {
      const mod = await import('@/lib/hedgewiki');
      const spy = jest.spyOn(global, 'fetch')
        .mockRejectedValueOnce(new Error('Timeout'));

      const result = await mod.fetchPolicyPresets();

      expect(result).toEqual([]);
      spy.mockRestore();
    });
  });

  test('returns empty array on non-OK response', async () => {
    await jest.isolateModulesAsync(async () => {
      const mod = await import('@/lib/hedgewiki');
      const spy = jest.spyOn(global, 'fetch')
        .mockResolvedValueOnce(errorResponse(503));

      const result = await mod.fetchPolicyPresets();

      expect(result).toEqual([]);
      spy.mockRestore();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. fetchComputeEffectiveness
// ═══════════════════════════════════════════════════════════════════════════

describe('fetchComputeEffectiveness', () => {
  const periods = [
    { periodIndex: 1, hedgedItemChange: -50000, instrumentChange: 48000 },
    { periodIndex: 2, hedgedItemChange: -30000, instrumentChange: 29500 },
  ];
  const config = { standard: 'IFRS9', method: 'dollar-offset' };

  test('sends POST with correct body and headers', async () => {
    const responsePayload = { ratio: 0.96, qualified: true };
    fetchSpy.mockResolvedValueOnce(okResponse(responsePayload));

    const result = await fetchComputeEffectiveness(periods, config);

    expect(result).toEqual(responsePayload);
    expect(fetchSpy).toHaveBeenCalledWith(`${WIKI_BASE}/compute/effectiveness`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ periods, config }),
    });
  });

  test('sends POST without config when not provided', async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ ratio: 0.95 }));

    await fetchComputeEffectiveness(periods);

    expect(fetchSpy).toHaveBeenCalledWith(`${WIKI_BASE}/compute/effectiveness`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ periods, config: undefined }),
    });
  });

  test('returns null on network error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await fetchComputeEffectiveness(periods, config);

    expect(result).toBeNull();
  });

  test('returns null on non-OK response', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(422));

    const result = await fetchComputeEffectiveness(periods, config);

    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Cache Behavior
// ═══════════════════════════════════════════════════════════════════════════
// The module-level _cache Map persists across tests within the same module
// import. We use jest.isolateModules to get a clean cache for each cache test.
// ═══════════════════════════════════════════════════════════════════════════

describe('cache behavior', () => {
  // Each test in this block isolates the module to guarantee a clean cache.

  test('fetchKnowledgeContext caches successful responses', async () => {
    await jest.isolateModulesAsync(async () => {
      const mod = await import('@/lib/hedgewiki');
      const spy = jest.spyOn(global, 'fetch')
        .mockResolvedValue(okResponse(sampleContext));

      // First call — should hit fetch
      const first = await mod.fetchKnowledgeContext('cached-slug');
      expect(first).toEqual(sampleContext);
      expect(spy).toHaveBeenCalledTimes(1);

      // Second call — should return cached, no additional fetch
      const second = await mod.fetchKnowledgeContext('cached-slug');
      expect(second).toEqual(sampleContext);
      expect(spy).toHaveBeenCalledTimes(1); // Still 1

      spy.mockRestore();
    });
  });

  test('fetchKnowledgeContext cache expires after TTL', async () => {
    await jest.isolateModulesAsync(async () => {
      const mod = await import('@/lib/hedgewiki');
      const spy = jest.spyOn(global, 'fetch')
        .mockResolvedValue(okResponse(sampleContext));

      // Populate cache
      await mod.fetchKnowledgeContext('ttl-slug');
      expect(spy).toHaveBeenCalledTimes(1);

      // Advance time past the 30-minute TTL
      const realDateNow = Date.now;
      const baseTime = Date.now();
      Date.now = jest.fn(() => baseTime + 31 * 60 * 1000); // 31 minutes later

      // Should re-fetch because cache expired
      await mod.fetchKnowledgeContext('ttl-slug');
      expect(spy).toHaveBeenCalledTimes(2);

      Date.now = realDateNow; // Restore
      spy.mockRestore();
    });
  });

  test('fetchFormulas caches results', async () => {
    await jest.isolateModulesAsync(async () => {
      const mod = await import('@/lib/hedgewiki');
      const formulas = [sampleFormula];
      const spy = jest.spyOn(global, 'fetch')
        .mockResolvedValue(okResponse({ formulas }));

      const first = await mod.fetchFormulas();
      expect(first).toEqual(formulas);

      const second = await mod.fetchFormulas();
      expect(second).toEqual(formulas);

      // Only one fetch call — second was served from cache
      expect(spy).toHaveBeenCalledTimes(1);

      spy.mockRestore();
    });
  });

  test('fetchPolicyPresets caches results', async () => {
    await jest.isolateModulesAsync(async () => {
      const mod = await import('@/lib/hedgewiki');
      const presets = [samplePreset];
      const spy = jest.spyOn(global, 'fetch')
        .mockResolvedValue(okResponse({ presets }));

      const first = await mod.fetchPolicyPresets();
      expect(first).toEqual(presets);

      const second = await mod.fetchPolicyPresets();
      expect(second).toEqual(presets);

      expect(spy).toHaveBeenCalledTimes(1);

      spy.mockRestore();
    });
  });

  test('fetchFormula does NOT cache (no caching in implementation)', async () => {
    await jest.isolateModulesAsync(async () => {
      const mod = await import('@/lib/hedgewiki');
      const spy = jest.spyOn(global, 'fetch')
        .mockResolvedValue(okResponse(sampleFormula));

      await mod.fetchFormula('bs');
      await mod.fetchFormula('bs');

      // fetchFormula has no cache — both calls should hit fetch
      expect(spy).toHaveBeenCalledTimes(2);

      spy.mockRestore();
    });
  });

  test('failed requests are not cached by fetchKnowledgeContext', async () => {
    await jest.isolateModulesAsync(async () => {
      const mod = await import('@/lib/hedgewiki');
      const spy = jest.spyOn(global, 'fetch')
        .mockResolvedValueOnce(errorResponse(500))
        .mockResolvedValueOnce(okResponse(sampleContext));

      // First call fails — should not cache
      const first = await mod.fetchKnowledgeContext('retry-slug');
      expect(first).toBeNull();

      // Second call — should hit fetch again (not served from cache)
      const second = await mod.fetchKnowledgeContext('retry-slug');
      expect(second).toEqual(sampleContext);

      expect(spy).toHaveBeenCalledTimes(2);

      spy.mockRestore();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. API_BASE resolution
// ═══════════════════════════════════════════════════════════════════════════

describe('API_BASE resolution', () => {
  test('uses production URL when hostname matches known deployment', async () => {
    await jest.isolateModulesAsync(async () => {
      // Override window.location.hostname to a known production host
      (globalThis as any).window = { location: { hostname: 'hedgecore.vercel.app' } };
      // Clear env override
      delete process.env.NEXT_PUBLIC_API_URL;

      const mod = await import('@/lib/hedgewiki');
      const spy = jest.spyOn(global, 'fetch')
        .mockResolvedValue(okResponse(sampleContext));

      await mod.fetchKnowledgeContext('test-slug');

      // Should use the production base
      expect(spy).toHaveBeenCalledWith(
        'https://hedgecore.onrender.com/api/v1/hedgewiki/context/test-slug'
      );

      // Restore
      (globalThis as any).window = { location: { hostname: 'localhost' } };
      spy.mockRestore();
    });
  });

  test('uses NEXT_PUBLIC_API_URL env var when set', async () => {
    await jest.isolateModulesAsync(async () => {
      process.env.NEXT_PUBLIC_API_URL = 'https://custom-api.example.com';

      const mod = await import('@/lib/hedgewiki');
      const spy = jest.spyOn(global, 'fetch')
        .mockResolvedValue(okResponse(sampleContext));

      await mod.fetchKnowledgeContext('env-slug');

      expect(spy).toHaveBeenCalledWith(
        'https://custom-api.example.com/v1/hedgewiki/context/env-slug'
      );

      delete process.env.NEXT_PUBLIC_API_URL;
      spy.mockRestore();
    });
  });
});
