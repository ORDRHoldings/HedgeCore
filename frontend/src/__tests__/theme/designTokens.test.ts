/**
 * @jest-environment node
 */
/**
 * Tests for the design tokens T object.
 * Validates: all tokens are CSS variable references, correct mappings,
 * no hardcoded colors, token categories present.
 */
import { T } from "@/lib/design/tokens";
import type { TokenKey } from "@/lib/design/tokens";

// ---------------------------------------------------------------------------
// Design tokens T object
// ---------------------------------------------------------------------------
describe("Design tokens T object", () => {
  test("exports T object", () => {
    expect(T).toBeDefined();
    expect(typeof T).toBe("object");
  });

  test("all values are CSS variable references (start with 'var(--')", () => {
    for (const [key, value] of Object.entries(T)) {
      expect(value).toMatch(/var\(--/);
    }
  });

  test("has surface tokens: bgDeep, bgPanel, bgSub, bgSidebar", () => {
    expect(T).toHaveProperty("bgDeep");
    expect(T).toHaveProperty("bgPanel");
    expect(T).toHaveProperty("bgSub");
    expect(T).toHaveProperty("bgSidebar");
  });

  test("has sidebar tokens: sidebarHover, sidebarBorder, sidebarDivider", () => {
    expect(T).toHaveProperty("sidebarHover");
    expect(T).toHaveProperty("sidebarBorder");
    expect(T).toHaveProperty("sidebarDivider");
  });

  test("has border tokens: rim, soft", () => {
    expect(T).toHaveProperty("rim");
    expect(T).toHaveProperty("soft");
  });

  test("has text tokens: primary, secondary, tertiary, disabled", () => {
    expect(T).toHaveProperty("primary");
    expect(T).toHaveProperty("secondary");
    expect(T).toHaveProperty("tertiary");
    expect(T).toHaveProperty("disabled");
  });

  test("has accent tokens: accent, accentDim", () => {
    expect(T).toHaveProperty("accent");
    expect(T).toHaveProperty("accentDim");
  });

  test("has status tokens: pass, fail, warn", () => {
    expect(T).toHaveProperty("pass");
    expect(T).toHaveProperty("fail");
    expect(T).toHaveProperty("warn");
  });

  test("has font tokens: fontUI, fontMono", () => {
    expect(T).toHaveProperty("fontUI");
    expect(T).toHaveProperty("fontMono");
  });

  test("exports TokenKey type (keys match T object keys)", () => {
    // Verify at compile-time via the type import, and at runtime by checking
    // that the keys of T match the expected set.
    const keys: TokenKey[] = Object.keys(T) as TokenKey[];
    expect(keys.length).toBeGreaterThan(0);
    // All listed keys should be present
    const expected: TokenKey[] = [
      "bgDeep", "bgPanel", "bgSub", "bgSidebar",
      "sidebarHover", "sidebarBorder", "sidebarDivider",
      "rim", "soft",
      "primary", "secondary", "tertiary", "disabled",
      "accent", "accentDim",
      "pass", "fail", "warn",
      "fontUI", "fontMono",
    ];
    for (const k of expected) {
      expect(keys).toContain(k);
    }
  });
});

// ---------------------------------------------------------------------------
// Token-to-CSS variable mapping
// ---------------------------------------------------------------------------
describe("Token-to-CSS variable mapping", () => {
  test("bgDeep maps to --bg-deep", () => {
    expect(T.bgDeep).toContain("--bg-deep");
  });

  test("bgPanel maps to --bg-panel", () => {
    expect(T.bgPanel).toContain("--bg-panel");
  });

  test("bgSub maps to --bg-sub", () => {
    expect(T.bgSub).toContain("--bg-sub");
  });

  test("bgSidebar maps to --bg-sidebar", () => {
    expect(T.bgSidebar).toContain("--bg-sidebar");
  });

  test("accent maps to --accent-blue", () => {
    expect(T.accent).toContain("--accent-blue");
  });

  test("accentDim maps to --accent-blue-dim", () => {
    expect(T.accentDim).toContain("--accent-blue-dim");
  });

  test("sidebarHover maps to --sidebar-hover", () => {
    expect(T.sidebarHover).toContain("--sidebar-hover");
  });

  test("sidebarBorder maps to --sidebar-border", () => {
    expect(T.sidebarBorder).toContain("--sidebar-border");
  });

  test("sidebarDivider maps to --sidebar-divider", () => {
    expect(T.sidebarDivider).toContain("--sidebar-divider");
  });

  test("rim maps to --border-rim", () => {
    expect(T.rim).toContain("--border-rim");
  });

  test("soft maps to --border-soft", () => {
    expect(T.soft).toContain("--border-soft");
  });

  test("primary maps to --text-primary", () => {
    expect(T.primary).toContain("--text-primary");
  });

  test("secondary maps to --text-secondary", () => {
    expect(T.secondary).toContain("--text-secondary");
  });

  test("tertiary maps to --text-tertiary", () => {
    expect(T.tertiary).toContain("--text-tertiary");
  });

  test("disabled maps to --text-disabled", () => {
    expect(T.disabled).toContain("--text-disabled");
  });

  test("pass maps to --status-pass", () => {
    expect(T.pass).toContain("--status-pass");
  });

  test("fail maps to --status-fail", () => {
    expect(T.fail).toContain("--status-fail");
  });

  test("warn maps to --status-warn", () => {
    expect(T.warn).toContain("--status-warn");
  });

  test("fontUI contains --font-terminal", () => {
    expect(T.fontUI).toContain("--font-terminal");
  });

  test("fontMono contains --font-terminal-mono", () => {
    expect(T.fontMono).toContain("--font-terminal-mono");
  });

  test("each token value contains the expected CSS variable name", () => {
    const expectedMappings: Record<string, string> = {
      bgDeep: "--bg-deep",
      bgPanel: "--bg-panel",
      bgSub: "--bg-sub",
      bgSidebar: "--bg-sidebar",
      sidebarHover: "--sidebar-hover",
      sidebarBorder: "--sidebar-border",
      sidebarDivider: "--sidebar-divider",
      rim: "--border-rim",
      soft: "--border-soft",
      primary: "--text-primary",
      secondary: "--text-secondary",
      tertiary: "--text-tertiary",
      disabled: "--text-disabled",
      accent: "--accent-blue",
      accentDim: "--accent-blue-dim",
      pass: "--status-pass",
      fail: "--status-fail",
      warn: "--status-warn",
    };
    for (const [tokenKey, cssVar] of Object.entries(expectedMappings)) {
      const value = (T as Record<string, string>)[tokenKey];
      expect(value).toContain(cssVar);
    }
  });
});

// ---------------------------------------------------------------------------
// No hardcoded colors in tokens
// ---------------------------------------------------------------------------
describe("No hardcoded colors in tokens", () => {
  test("no token value contains # (hex color)", () => {
    for (const [key, value] of Object.entries(T)) {
      expect(value).not.toMatch(/#[0-9A-Fa-f]{3,6}/);
    }
  });

  test("no token value contains rgb( (direct color)", () => {
    // The T object has no fallback rgb values. Font tokens use var() with
    // fallback font names, not rgb colors.
    for (const [key, value] of Object.entries(T)) {
      expect(value).not.toMatch(/\brgb\(/);
      expect(value).not.toMatch(/\brgba\(/);
    }
  });

  test("all values are either var() or font stack strings containing var()", () => {
    for (const [key, value] of Object.entries(T)) {
      // Every token value must include a CSS variable reference
      expect(value).toMatch(/var\(--[a-z-]+/);
    }
  });
});
