import { T } from "@/lib/design/tokens";

describe("Design tokens", () => {
  it("exports all required surface tokens", () => {
    expect(T.bgDeep).toBe("var(--bg-deep)");
    expect(T.bgPanel).toBe("var(--bg-panel)");
    expect(T.bgSub).toBe("var(--bg-sub)");
    expect(T.bgSidebar).toBe("var(--bg-sidebar)");
  });

  it("exports all required text tokens", () => {
    expect(T.primary).toBe("var(--text-primary)");
    expect(T.secondary).toBe("var(--text-secondary)");
    expect(T.tertiary).toBe("var(--text-tertiary)");
    expect(T.disabled).toBe("var(--text-disabled)");
  });

  it("exports accent as single blue", () => {
    expect(T.accent).toBe("var(--accent-blue)");
    expect(T.accentDim).toBe("var(--accent-blue-dim)");
  });

  it("exports status tokens for data only", () => {
    expect(T.pass).toBe("var(--status-pass)");
    expect(T.fail).toBe("var(--status-fail)");
    expect(T.warn).toBe("var(--status-warn)");
  });

  it("uses IBM Plex Sans as primary UI font", () => {
    expect(T.fontUI).toContain("IBM Plex Sans");
  });

  it("uses IBM Plex Mono as primary mono font", () => {
    expect(T.fontMono).toContain("IBM Plex Mono");
  });

  it("has no hardcoded hex values", () => {
    for (const [key, value] of Object.entries(T)) {
      if (key.startsWith("font")) continue;
      expect(value).toMatch(/^var\(--/);
    }
  });
});
