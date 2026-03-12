/**
 * marketIntelligenceUx.test.ts
 *
 * Validates the 5 UX fixes applied to /market-intelligence page:
 * 1. No duplicate header (custom header removed, actions in PageShell)
 * 2. FX_PAIRS renamed (no underscore prefix)
 * 3. CSS keyframes moved to globals.css (no inline <style> tag)
 * 4. Health bar uses flexShrink layout (no sticky positioning)
 * 5. Visibility-aware polling (visibilitychange handler)
 */

import * as fs from "fs";
import * as path from "path";

const PAGE_PATH = path.resolve(
  __dirname,
  "../../app/market-intelligence/page.tsx"
);
const GLOBALS_CSS_PATH = path.resolve(__dirname, "../../app/globals.css");

const pageSource = fs.readFileSync(PAGE_PATH, "utf-8");
const globalsCss = fs.readFileSync(GLOBALS_CSS_PATH, "utf-8");

// ── Fix 1: No duplicate header ──────────────────────────────────────────────

describe("Fix 1: duplicate header removed", () => {
  it("does not render 'Market Intelligence Hub' as an h1 element in JSX", () => {
    // The string may appear in JSDoc comments, but must not be in JSX
    expect(pageSource).not.toMatch(/>\s*Market Intelligence Hub\s*</);
  });

  it("uses PageShell actions prop", () => {
    expect(pageSource).toContain("actions={");
  });

  it("does not import Activity icon (was only used by removed header)", () => {
    // Activity should not appear in the imports
    const importSection = pageSource.split("from \"lucide-react\"")[0];
    expect(importSection).not.toContain("Activity");
  });

  it("LIVE badge is inside the actions prop, not a standalone header", () => {
    // The LIVE badge text should exist in JSX
    expect(pageSource).toMatch(/>\s*LIVE\s*<\/span>/);
    // The actions= block should contain LIVE
    const actionsStart = pageSource.indexOf("actions={");
    expect(actionsStart).toBeGreaterThan(-1);
    // Find the closing of PageShell opening tag (the > after actions block)
    // The LIVE span should appear between actions={ and the next children
    const afterActions = pageSource.substring(actionsStart, actionsStart + 1200);
    expect(afterActions).toContain("LIVE");
  });
});

// ── Fix 2: FX_PAIRS naming ──────────────────────────────────────────────────

describe("Fix 2: FX_PAIRS renamed", () => {
  it("exports FX_PAIRS without underscore prefix", () => {
    expect(pageSource).toContain("const FX_PAIRS");
  });

  it("does not contain _FX_PAIRS", () => {
    expect(pageSource).not.toContain("_FX_PAIRS");
  });

  it("FX_PAIRS is used in fetchForwardCurves", () => {
    expect(pageSource).toContain("FX_PAIRS.join");
  });
});

// ── Fix 3: CSS keyframes in globals.css ─────────────────────────────────────

describe("Fix 3: keyframes moved to globals.css", () => {
  it("does not contain an inline <style> tag", () => {
    // No <style>{` pattern should exist in the page
    expect(pageSource).not.toMatch(/<style>\s*\{`/);
  });

  it("globals.css contains @keyframes mi-spin", () => {
    expect(globalsCss).toContain("@keyframes mi-spin");
  });

  it("globals.css contains @keyframes mi-pulse", () => {
    expect(globalsCss).toContain("@keyframes mi-pulse");
  });

  it("mi-spin keyframe has rotate transform", () => {
    const spinIdx = globalsCss.indexOf("@keyframes mi-spin");
    const spinBlock = globalsCss.substring(spinIdx, spinIdx + 200);
    expect(spinBlock).toContain("rotate(360deg)");
  });

  it("page references mi-spin (not bare spin)", () => {
    // All spin animations should be mi-spin
    const spinRefs = pageSource.match(/animation:.*?"[^"]*spin/g) || [];
    for (const ref of spinRefs) {
      expect(ref).toContain("mi-spin");
    }
  });

  it("page references mi-pulse (not bare pulse)", () => {
    const pulseRefs = pageSource.match(/animation:.*?"[^"]*pulse/g) || [];
    for (const ref of pulseRefs) {
      expect(ref).toContain("mi-pulse");
    }
  });
});

// ── Fix 4: Health bar layout ────────────────────────────────────────────────

describe("Fix 4: health bar not sticky", () => {
  it("does not use position: sticky in MarketHealthBar", () => {
    // Find the MarketHealthBar function body
    const barStart = pageSource.indexOf("function MarketHealthBar");
    const barEnd = pageSource.indexOf("\n}\n", barStart);
    const barBody = pageSource.substring(barStart, barEnd);
    expect(barBody).not.toContain("position: \"sticky\"");
    expect(barBody).not.toContain("position: 'sticky'");
  });

  it("health bar uses flexShrink: 0", () => {
    const barStart = pageSource.indexOf("function MarketHealthBar");
    const barEnd = pageSource.indexOf("\n}\n", barStart);
    const barBody = pageSource.substring(barStart, barEnd);
    expect(barBody).toContain("flexShrink: 0");
  });

  it("content wrapper uses flex column layout", () => {
    // The outer wrapper div should have display flex + column
    expect(pageSource).toContain("flexDirection: \"column\"");
    expect(pageSource).toContain("minHeight: \"calc(100vh - 64px)\"");
  });

  it("content area does not have paddingBottom: 60 (no longer needed)", () => {
    // The old paddingBottom: 60 was there to account for sticky bar
    const contentSection = pageSource.substring(
      pageSource.indexOf("{/* ── Content"),
      pageSource.indexOf("{/* ── Health Footer")
    );
    expect(contentSection).not.toContain("paddingBottom: 60");
  });
});

// ── Fix 5: Visibility-aware polling ─────────────────────────────────────────

describe("Fix 5: visibility-aware polling", () => {
  it("listens for visibilitychange event", () => {
    expect(pageSource).toContain("visibilitychange");
  });

  it("checks document.hidden", () => {
    expect(pageSource).toContain("document.hidden");
  });

  it("clears fxTimerRef on hidden", () => {
    // The visibility handler should clear intervals
    const visStart = pageSource.indexOf("visibilitychange");
    const visBlock = pageSource.substring(visStart - 500, visStart + 500);
    expect(visBlock).toContain("clearInterval(fxTimerRef.current)");
  });

  it("clears sectorTimerRef on hidden", () => {
    const visStart = pageSource.indexOf("visibilitychange");
    const visBlock = pageSource.substring(visStart - 500, visStart + 500);
    expect(visBlock).toContain("clearInterval(sectorTimerRef.current)");
  });

  it("resumes fetchAll on visible", () => {
    const visStart = pageSource.indexOf("visibilitychange");
    const visBlock = pageSource.substring(visStart - 500, visStart + 500);
    expect(visBlock).toContain("fetchAll()");
  });

  it("removes visibilitychange listener on cleanup", () => {
    expect(pageSource).toContain(
      'removeEventListener("visibilitychange"'
    );
  });
});
