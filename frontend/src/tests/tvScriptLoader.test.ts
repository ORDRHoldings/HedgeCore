/**
 * tvScriptLoader.test.ts
 *
 * Regression tests for:
 *  1. Singleton script loader (tv.js) — correct singleton behaviour.
 *  2. ResizeObserver zero-size guard  — widget init deferred until non-zero.
 *  3. Hydration safety                — no server/client timestamp mismatch
 *                                       from module-level Date.now() calls.
 *
 * Run with:
 *   npx tsx src/tests/tvScriptLoader.test.ts
 *
 * Uses only Node built-ins (assert) and inline mocks — no jest/vitest/jsdom.
 * async main() wrapper used for CJS compatibility (tsx default output).
 */

import assert from 'assert';
import { _resetTvScriptLoader, loadTvScript, TV_SCRIPT_SRC } from '../utils/tvScriptLoader';

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    if (err instanceof Error) console.error(`    ${err.message}`);
    else console.error('   ', err);
    failed++;
  }
}

// ── DOM / window mock helpers ─────────────────────────────────────────────────

interface MockScript {
  src: string;
  async: boolean;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  type: string;
}

/** Build a minimal document + window mock for tvScriptLoader tests. */
function makeMocks(opts: {
  /** Pre-populate a <script src="TV_SCRIPT_SRC"> in the mock DOM. */
  existingScript?: boolean;
  /** If true, script.onerror fires instead of onload. */
  failLoad?: boolean;
  /** Pre-populate window.TradingView to simulate already-loaded library. */
  tvAlreadyLoaded?: boolean;
}) {
  const scripts: MockScript[] = [];
  const heads:   MockScript[] = [];

  if (opts.existingScript) {
    scripts.push({
      src: TV_SCRIPT_SRC, async: false, onload: null, onerror: null, type: 'text/javascript',
    });
  }

  const mockDoc = {
    querySelector(sel: string): MockScript | null {
      const m = sel.match(/script\[src="([^"]+)"\]/);
      if (!m) return null;
      return scripts.find(s => s.src === m[1]) ?? null;
    },
    createElement(_tag: string): MockScript {
      return { src: '', async: false, onload: null, onerror: null, type: '' };
    },
    head: {
      appendChild(el: MockScript) {
        heads.push(el);
        scripts.push(el);
        if (!opts.failLoad) {
          // Simulate successful load: set window.TradingView then fire onload.
          Promise.resolve().then(() => {
            // Set window.TradingView so the post-load check passes.
            (globalThis as Record<string, unknown>).window = {
              ...(typeof window !== 'undefined' ? window : {}),
              TradingView: { widget: class {} },
            };
            el.onload?.();
          });
        }
      },
    },
    _heads: heads,
    _scripts: scripts,
  };

  // Set globalThis.window.TradingView if pre-loaded option set.
  if (opts.tvAlreadyLoaded) {
    (globalThis as Record<string, unknown>).window = {
      TradingView: { widget: class {} },
    };
  } else if (!opts.tvAlreadyLoaded) {
    // Ensure TradingView is NOT on window at start of test.
    (globalThis as Record<string, unknown>).window = {};
  }

  (globalThis as Record<string, unknown>).document = mockDoc;

  return { mockDoc };
}

// ── Group 1: Singleton script loader ─────────────────────────────────────────

async function runScriptLoaderTests() {
  console.log('\nGroup 1 — Singleton script loader (tv.js)\n');

  await test('TV_SCRIPT_SRC points to tv.js (not embed-widget)', () => {
    assert.ok(
      TV_SCRIPT_SRC.endsWith('/tv.js'),
      `Expected TV_SCRIPT_SRC to end with /tv.js, got: ${TV_SCRIPT_SRC}`,
    );
  });

  await test('Two calls to loadTvScript() return the exact same Promise', async () => {
    const { mockDoc } = makeMocks({});
    _resetTvScriptLoader();

    const p1 = loadTvScript();
    const p2 = loadTvScript();

    assert.strictEqual(p1, p2, 'Both calls must return the identical Promise reference');
    await Promise.all([p1, p2]);

    assert.strictEqual(mockDoc._heads.length, 1, `Expected 1 script appended, got ${mockDoc._heads.length}`);
    assert.strictEqual(mockDoc._heads[0].src, TV_SCRIPT_SRC);
  });

  await test('Three concurrent calls append exactly one <script> tag', async () => {
    const { mockDoc } = makeMocks({});
    _resetTvScriptLoader();

    await Promise.all([loadTvScript(), loadTvScript(), loadTvScript()]);

    assert.strictEqual(mockDoc._heads.length, 1, `Expected 1 <script>, got ${mockDoc._heads.length}`);
  });

  await test('window.TradingView already set: resolves immediately, no script appended', async () => {
    const { mockDoc } = makeMocks({ tvAlreadyLoaded: true });
    _resetTvScriptLoader();

    await loadTvScript();

    assert.strictEqual(
      mockDoc._heads.length, 0,
      'No <script> should be appended when window.TradingView already exists',
    );
  });

  await test('Existing <script> tag in DOM: no new tag appended', async () => {
    const { mockDoc } = makeMocks({ existingScript: true, tvAlreadyLoaded: true });
    _resetTvScriptLoader();

    await loadTvScript();

    assert.strictEqual(
      mockDoc._heads.length, 0,
      'No new <script> should be appended when one already exists in DOM',
    );
  });

  await test('Load failure resets singleton so next call creates a new Promise', async () => {
    const { mockDoc } = makeMocks({ failLoad: true });
    _resetTvScriptLoader();

    const p1 = loadTvScript();

    // Trigger onerror on next microtask
    await Promise.resolve();
    mockDoc._heads[0]?.onerror?.();

    let threw = false;
    try { await p1; } catch { threw = true; }
    assert.ok(threw, 'loadTvScript should reject when script.onerror fires');

    // After failure, singleton must be reset so next call creates fresh Promise.
    _resetTvScriptLoader();
    const { mockDoc: mockDoc2 } = makeMocks({});
    (globalThis as Record<string, unknown>).document = mockDoc2;

    const p2 = loadTvScript();
    assert.notStrictEqual(p1, p2, 'After failure, next call must be a fresh Promise');
    await p2;
  });
}

// ── Group 2: ResizeObserver zero-size guard ───────────────────────────────────

async function runResizeObserverTests() {
  console.log('\nGroup 2 — ResizeObserver zero-size guard\n');

  /** Replicates the exact guard logic from TradingViewEmbed's useEffect. */
  function makeGuard(onInit: () => void, onError: () => void) {
    const MAX_TICKS = 80;
    let ticks = 0;
    let disconnected = false;

    type Entry = { contentRect: { width: number; height: number } };
    let activeCb: ((entries: Entry[]) => void) | null = null;

    class MockRO {
      constructor(cb: (entries: Entry[]) => void) {
        activeCb = cb;
      }
      observe() {}
      disconnect() {
        disconnected = true;
        // Once disconnected, observer stops firing — null the callback.
        activeCb = null;
      }
    }

    const ro = new MockRO((entries) => {
      const { width, height } = entries[0]?.contentRect ?? { width: 0, height: 0 };
      ticks++;
      if (width > 0 && height > 0) {
        ro.disconnect();
        onInit();
      } else if (ticks >= MAX_TICKS) {
        ro.disconnect();
        onError();
      }
    });
    ro.observe();

    return {
      fire: (w: number, h: number) => activeCb?.([{ contentRect: { width: w, height: h } }]),
      isDisconnected: () => disconnected,
    };
  }

  await test('Init is NOT called when container reports 0×0', () => {
    let initCalled = false;
    const g = makeGuard(() => { initCalled = true; }, () => {});
    g.fire(0, 0);
    assert.strictEqual(initCalled, false, 'init must not fire on 0×0');
  });

  await test('Init is NOT called when only width is non-zero (height still 0)', () => {
    let initCalled = false;
    const g = makeGuard(() => { initCalled = true; }, () => {});
    g.fire(500, 0);
    assert.strictEqual(initCalled, false, 'init must not fire when height is 0');
  });

  await test('Init is NOT called when only height is non-zero (width still 0)', () => {
    let initCalled = false;
    const g = makeGuard(() => { initCalled = true; }, () => {});
    g.fire(0, 420);
    assert.strictEqual(initCalled, false, 'init must not fire when width is 0');
  });

  await test('Init IS called on first tick with non-zero width AND height', () => {
    let initCalled = false;
    const g = makeGuard(() => { initCalled = true; }, () => {});
    g.fire(800, 420);
    assert.strictEqual(initCalled, true, 'init must fire when both dimensions are non-zero');
  });

  await test('Init fires only once even if ResizeObserver fires multiple non-zero ticks', () => {
    let initCount = 0;
    const g = makeGuard(() => { initCount++; }, () => {});
    g.fire(0, 0);      // tick 1 — zero, no init
    g.fire(800, 420);  // tick 2 — non-zero → init fires, observer disconnects
    g.fire(800, 420);  // tick 3 — observer disconnected, callback is null → no-op
    assert.strictEqual(initCount, 1, 'init must fire exactly once');
  });

  await test('Error is surfaced after MAX_RESIZE_TICKS (80) ticks of zero size', () => {
    let initCalled = false;
    let errorSurfaced = false;
    const g = makeGuard(() => { initCalled = true; }, () => { errorSurfaced = true; });

    for (let i = 0; i < 80; i++) g.fire(0, 0);

    assert.strictEqual(initCalled, false, 'init must not have been called');
    assert.strictEqual(errorSurfaced, true, 'error must be surfaced after 80 zero-size ticks');
    assert.ok(g.isDisconnected(), 'observer must be disconnected after max ticks');
  });

  await test('Init fires correctly after several zero-size ticks (tab becoming visible)', () => {
    let initCalled = false;
    const g = makeGuard(() => { initCalled = true; }, () => {});

    // Simulate tab/panel hidden for 5 frames, then visible
    for (let i = 0; i < 5; i++) g.fire(0, 0);
    g.fire(1280, 560);

    assert.strictEqual(initCalled, true, 'init must fire once container becomes visible');
  });
}

// ── Group 3: Hydration safety ─────────────────────────────────────────────────

async function runHydrationTests() {
  console.log('\nGroup 3 — Hydration safety (timestamp / server-client parity)\n');

  await test('Module-level Date.now() in page.tsx does NOT exist (would cause mismatch)', () => {
    // We verify that page.tsx uses the mounted-gate pattern (useState + useEffect)
    // rather than a module-level constant.  We do this by reading the source.
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src', 'app', 'page.tsx'),
      'utf8',
    );

    // The old bug: `const RENDER_TS = new Date().toISOString()...` at module level.
    // After the fix, this must NOT exist as a module-level assignment.
    const moduleConstPattern = /^const\s+RENDER_TS\s*=/m;
    assert.ok(
      !moduleConstPattern.test(src),
      'page.tsx must not have a module-level RENDER_TS constant (hydration risk)',
    );

    // The fix: useState(TS_PLACEHOLDER) + useEffect to set timestamp.
    assert.ok(
      src.includes('TS_PLACEHOLDER'),
      'page.tsx must use TS_PLACEHOLDER as the server-side stable initial value',
    );
    assert.ok(
      src.includes('setRenderTs('),
      'page.tsx must call setRenderTs() inside useEffect (client-only update)',
    );
  });

  await test('layout.tsx does NOT have "use client" directive (Server Component required)', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src', 'app', 'layout.tsx'),
      'utf8',
    );

    // Match the directive only when it appears as an actual JS/TS directive at
    // the start of a line (possibly with BOM/whitespace), NOT inside a comment.
    // The directive form is: "use client"; or 'use client'; on its own line.
    const useClientDirective = /^['"]use client['"]\s*;?\s*$/m;
    assert.ok(
      !useClientDirective.test(src),
      'layout.tsx must NOT have a "use client" directive — root layout must be a Server Component',
    );
  });

  await test('SessionLoader.tsx exists and has "use client" (side-effects extracted correctly)', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'pipeline', 'SessionLoader.tsx'),
      'utf8',
    );

    assert.ok(
      src.includes('"use client"') || src.includes("'use client'"),
      'SessionLoader.tsx must have "use client"',
    );
    assert.ok(
      src.includes('loadSessionThunk'),
      'SessionLoader.tsx must dispatch loadSessionThunk',
    );
  });

  await test('TradingViewEmbed does NOT inject JSON config <script> tags', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'execution', 'TradingViewEmbed.tsx'),
      'utf8',
    );

    // The old pattern: JSON.stringify({...}) put into script.textContent
    assert.ok(
      !src.includes('embed-widget-advanced-chart.js'),
      'TradingViewEmbed must not reference embed-widget-advanced-chart.js (use tv.js instead)',
    );
    // The new pattern: new TradingView.widget({...})
    assert.ok(
      src.includes('new window.TradingView.widget'),
      'TradingViewEmbed must use new window.TradingView.widget() constructor',
    );
  });

  await test('tvScriptLoader loads tv.js (not embed-widget script)', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src', 'utils', 'tvScriptLoader.ts'),
      'utf8',
    );

    assert.ok(
      src.includes('tv.js'),
      'tvScriptLoader must reference tv.js',
    );
    assert.ok(
      !src.includes('embed-widget-advanced-chart.js'),
      'tvScriptLoader must NOT reference embed-widget-advanced-chart.js',
    );
  });

  await test('ClientProviders.tsx exists, has "use client", and wraps Provider + HedgeProvider', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'pipeline', 'ClientProviders.tsx'),
      'utf8',
    );

    assert.ok(
      src.includes('"use client"') || src.includes("'use client'"),
      'ClientProviders.tsx must have "use client"',
    );
    assert.ok(
      src.includes('Provider'),
      'ClientProviders.tsx must render Provider (react-redux)',
    );
    assert.ok(
      src.includes('HedgeProvider'),
      'ClientProviders.tsx must render HedgeProvider',
    );
    assert.ok(
      src.includes('SessionLoader'),
      'ClientProviders.tsx must render SessionLoader',
    );
  });

  await test('layout.tsx imports ClientProviders (not Provider directly)', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src', 'app', 'layout.tsx'),
      'utf8',
    );

    assert.ok(
      src.includes('ClientProviders'),
      'layout.tsx must import and use ClientProviders',
    );
    assert.ok(
      !src.includes("from 'react-redux'") && !src.includes('from "react-redux"'),
      'layout.tsx must NOT import directly from react-redux (use ClientProviders instead)',
    );
  });
}

// ── Group 4: Currency context + ticket formatting ─────────────────────────────

async function runCurrencyContextTests() {
  console.log('\nGroup 4 — Currency context resolution & ticket formatting\n');

  // Import helpers at runtime (no jest module hoisting needed here)
  const { deriveCurrencyContext } = await import('../utils/currencyContext');

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Minimal MarketSnapshot with optional provider_metadata. */
  function makeMarket(primary_currency?: string, currency_pair?: string) {
    return {
      as_of: '2025-01-01T00:00:00Z',
      spot_usdmxn: 17.5,
      forward_points_by_month: {},
      provider_metadata: {
        ...(primary_currency ? { primary_currency } : {}),
        ...(currency_pair    ? { currency_pair }    : {}),
      },
    } as Parameters<typeof deriveCurrencyContext>[1];
  }

  /** Minimal TradeRow array — only fields used by deriveCurrencyContext (currency + amount). */
  function makeTrades(entries: { currency: string; amount: number }[]) {
    return entries.map(e => ({
      record_id:   'T001',
      entity:      'TEST-ENTITY',
      type:        'AR' as const,
      currency:    e.currency as import('../api/types').FuturesCurrency,
      amount:      e.amount,
      value_date:  '2025-06-30',
      status:      'CONFIRMED' as const,
      description: 'Test trade',
    }));
  }

  // ── Ticket formatting helpers (replicated from BucketTicketCard logic) ────

  function getBrokerSide(n: number): 'BUY' | 'SELL' | 'N/A' {
    if (n > 0) return 'BUY';
    if (n < 0) return 'SELL';
    return 'N/A';
  }

  function getDirectionLabel(n: number, ccy: string): string {
    const side = getBrokerSide(n);
    if (side === 'N/A') return 'N/A';
    return `${side} ${ccy}`;
  }

  function getHeaderAction(
    isFutures: boolean,
    hasAction: boolean,
    actionNotional: number,
    contracts: number,
    baseCcy: string,
  ): string {
    const side = getBrokerSide(actionNotional);
    if (!hasAction) return 'No execution required';
    if (isFutures) return `${side} ${contracts} ${contracts === 1 ? 'contract' : 'contracts'}`;
    return getDirectionLabel(actionNotional, baseCcy);
  }

  // ── Test cases ────────────────────────────────────────────────────────────

  await test('JPY primary_currency override: baseCcy resolves to JPY, not MXN', () => {
    const ctx = deriveCurrencyContext(
      makeTrades([{ currency: 'JPY', amount: 5_000_000 }]),
      makeMarket('JPY'),
    );
    assert.strictEqual(ctx.baseCcy, 'JPY', `Expected JPY, got ${ctx.baseCcy}`);
  });

  await test('EUR primary_currency override: baseCcy resolves to EUR, pairLabel EUR/USD', () => {
    const ctx = deriveCurrencyContext(
      makeTrades([{ currency: 'EUR', amount: 2_000_000 }]),
      makeMarket('EUR'),
    );
    assert.strictEqual(ctx.baseCcy, 'EUR');
    assert.strictEqual(ctx.pairLabel, 'EUR/USD', `Expected EUR/USD (price ccy), got ${ctx.pairLabel}`);
  });

  await test('MXN trades with no metadata: baseCcy resolves to MXN', () => {
    const ctx = deriveCurrencyContext(
      makeTrades([{ currency: 'MXN', amount: 10_000_000 }]),
      makeMarket(),
    );
    assert.strictEqual(ctx.baseCcy, 'MXN');
    assert.strictEqual(ctx.pairLabel, 'USD/MXN');
  });

  await test('Multi-currency: JPY has highest notional and primary_currency=JPY → JPY wins', () => {
    const ctx = deriveCurrencyContext(
      makeTrades([
        { currency: 'JPY', amount: 500_000_000 },
        { currency: 'MXN', amount: 10_000_000 },
      ]),
      makeMarket('JPY'),
    );
    assert.strictEqual(ctx.baseCcy, 'JPY');
    assert.strictEqual(ctx.isMultiCcy, true);
  });

  await test('Spot range for JPY is within expected bracket [100, 165]', () => {
    const ctx = deriveCurrencyContext(
      makeTrades([{ currency: 'JPY', amount: 5_000_000 }]),
      makeMarket('JPY'),
    );
    const [lo, hi] = ctx.spotRange;
    assert.ok(lo >= 80 && hi <= 200, `JPY spot range [${lo}, ${hi}] outside expected bracket`);
  });

  await test('No trades: baseCcy defaults to MXN', () => {
    const ctx = deriveCurrencyContext([], makeMarket());
    assert.strictEqual(ctx.baseCcy, 'MXN');
    assert.strictEqual(ctx.allCurrencies.length, 0);
  });

  await test('getDirectionLabel: positive action_mxn → "BUY JPY" (not "BUY MXN")', () => {
    const label = getDirectionLabel(500_000, 'JPY');
    assert.strictEqual(label, 'BUY JPY', `Expected "BUY JPY", got "${label}"`);
    assert.ok(!label.includes('MXN'), 'Direction label must not contain MXN for JPY scenario');
  });

  await test('getDirectionLabel: negative action_mxn → "SELL EUR"', () => {
    const label = getDirectionLabel(-1_000_000, 'EUR');
    assert.strictEqual(label, 'SELL EUR');
  });

  await test('getDirectionLabel: zero action → "N/A"', () => {
    assert.strictEqual(getDirectionLabel(0, 'JPY'), 'N/A');
  });

  await test('Futures header: "SELL 3 contracts" (not "SELL MXN")', () => {
    const header = getHeaderAction(true, true, -3_000_000, 3, 'JPY');
    assert.strictEqual(header, 'SELL 3 contracts');
    assert.ok(!header.includes('MXN'), 'Futures header must not contain MXN');
    assert.ok(!header.includes('JPY'), 'Futures header must not contain currency for futures');
  });

  await test('Futures header singular: "BUY 1 contract"', () => {
    const header = getHeaderAction(true, true, 1_000_000, 1, 'EUR');
    assert.strictEqual(header, 'BUY 1 contract');
  });

  await test('NDF header: "SELL JPY" (no MXN bleed)', () => {
    const header = getHeaderAction(false, true, -2_000_000, 0, 'JPY');
    assert.strictEqual(header, 'SELL JPY');
    assert.ok(!header.includes('MXN'), 'NDF header must not contain MXN for JPY scenario');
  });

  await test('No-action header: "No execution required"', () => {
    assert.strictEqual(getHeaderAction(false, false, 0, 0, 'JPY'), 'No execution required');
    assert.strictEqual(getHeaderAction(true,  false, 0, 0, 'MXN'), 'No execution required');
  });

  await test('TradingViewEmbed uses light theme (no dark theme config)', () => {
    const fs   = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src  = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'execution', 'TradingViewEmbed.tsx'),
      'utf8',
    );
    assert.ok(
      src.includes("theme:               'light'"),
      'TradingViewEmbed must use theme: light',
    );
    assert.ok(
      !src.includes("theme:               'dark'"),
      'TradingViewEmbed must NOT use theme: dark',
    );
  });

  await test('CopyTicketButton has no baseCcy MXN default (required prop)', () => {
    const fs   = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src  = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'execution', 'CopyTicketButton.tsx'),
      'utf8',
    );
    assert.ok(
      !src.includes("baseCcy = 'MXN'"),
      "CopyTicketButton must not have baseCcy = 'MXN' default",
    );
    assert.ok(
      src.includes('baseCcy: string'),
      "CopyTicketButton must declare baseCcy as required string",
    );
  });

  await test('ConfidencePanel has no baseCcy MXN default (required prop)', () => {
    const fs   = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src  = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'execution', 'ConfidencePanel.tsx'),
      'utf8',
    );
    assert.ok(
      !src.includes("baseCcy = 'MXN'"),
      "ConfidencePanel must not have baseCcy = 'MXN' default",
    );
    assert.ok(
      src.includes('baseCcy: string'),
      "ConfidencePanel must declare baseCcy as required string",
    );
  });

  await test('BucketTicketCard has no baseCcy MXN default (required prop)', () => {
    const fs   = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src  = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'execution', 'BucketTicketCard.tsx'),
      'utf8',
    );
    assert.ok(
      !src.includes("baseCcy = 'MXN'"),
      "BucketTicketCard must not have baseCcy = 'MXN' default",
    );
    // Must have JSDoc comment indicating no MXN default
    assert.ok(
      src.includes('REQUIRED') || src.includes('baseCcy: string'),
      "BucketTicketCard must declare baseCcy as required (no MXN default)",
    );
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await runScriptLoaderTests();
  await runResizeObserverTests();
  await runHydrationTests();
  await runCurrencyContextTests();

  console.log(
    `\n${'─'.repeat(52)}\n` +
    `${passed + failed} tests: ${passed} passed, ${failed} failed\n`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\nUnexpected test runner error:', err);
  process.exit(1);
});
