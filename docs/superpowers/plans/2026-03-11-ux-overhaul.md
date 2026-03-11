# ORDR Terminal UX Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform 71 disconnected pages into one cohesive, cold, authoritative institutional platform with unified design system, simplified navigation, and guided dashboard.

**Architecture:** Dark monochrome theme via CSS variable update (no component code changes for theme). Shared component library (PageShell, Icon, ActionButton, KpiStrip, DataTable) wraps all pages. Sidebar rebuilt with Lucide sharp icons. Dashboard replaced with Mission Control (greeting + 3 live-data cards). 13 pages deleted/merged. Market Overview and Audit Lab demo added.

**Tech Stack:** Next.js 15.5, React 19, TypeScript 5.9, lucide-react (existing), CSS variables, inline styles

**Spec:** `docs/superpowers/specs/2026-03-11-ux-overhaul-design.md`

---

## Chunk 1: Design System Foundation

### Task 1: Design Tokens (`lib/design/tokens.ts`)

**Files:**
- Create: `frontend/src/lib/design/tokens.ts`
- Test: `frontend/src/__tests__/design/tokens.test.ts`

- [ ] **Step 1: Create the tokens file**

```ts
// frontend/src/lib/design/tokens.ts

/**
 * ORDR Terminal Design Tokens — Single source of truth.
 * All values reference CSS variables defined in globals.css :root.
 * Never hardcode hex values here.
 */

export const T = {
  // Surface
  bgDeep:    "var(--bg-deep)",
  bgPanel:   "var(--bg-panel)",
  bgSub:     "var(--bg-sub)",
  bgSidebar: "var(--bg-sidebar)",

  // Border
  rim:  "var(--border-rim)",
  soft: "var(--border-soft)",

  // Text
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  disabled:  "var(--text-disabled)",

  // Accent (single blue — no cyan, no amber on chrome)
  accent:    "var(--accent-blue)",
  accentDim: "var(--accent-blue-dim)",

  // Status (data values only — never on UI chrome)
  pass: "var(--status-pass)",
  fail: "var(--status-fail)",
  warn: "var(--status-warn)",

  // Fonts
  fontUI:   "'IBM Plex Sans', var(--font-terminal, sans-serif)",
  fontMono: "'IBM Plex Mono', var(--font-terminal-mono, monospace)",
} as const;

export type TokenKey = keyof typeof T;
```

- [ ] **Step 2: Write test**

```ts
// frontend/src/__tests__/design/tokens.test.ts
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
```

- [ ] **Step 3: Run test**

Run: `cd frontend && npx jest src/__tests__/design/tokens.test.ts --no-coverage 2>&1 | tail -20`
Expected: All 7 tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/design/tokens.ts frontend/src/__tests__/design/tokens.test.ts
git commit -m "feat(design): add unified design tokens — single source of truth for all pages"
```

---

### Task 2: Icon Wrapper (`components/ui/Icon.tsx`)

**Files:**
- Create: `frontend/src/components/ui/Icon.tsx`
- Test: `frontend/src/__tests__/ui/Icon.test.tsx`

- [ ] **Step 1: Create the Icon component**

```tsx
// frontend/src/components/ui/Icon.tsx
import type { LucideIcon } from "lucide-react";

interface IconProps {
  icon: LucideIcon;
  size?: number;
  color?: string;
  className?: string;
}

/**
 * ORDR Icon wrapper — enforces cold, authoritative style.
 * Sharp square caps + miter joins. Never use raw Lucide imports.
 */
export function Icon({ icon: IconComponent, size = 20, color, className }: IconProps) {
  return (
    <IconComponent
      size={size}
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      color={color}
      className={className}
    />
  );
}
```

- [ ] **Step 2: Write test**

```tsx
// frontend/src/__tests__/ui/Icon.test.tsx
import { render } from "@testing-library/react";
import { Icon } from "@/components/ui/Icon";
import { LayoutDashboard } from "lucide-react";

describe("Icon", () => {
  it("renders with default size 20", () => {
    const { container } = render(<Icon icon={LayoutDashboard} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute("width")).toBe("20");
    expect(svg?.getAttribute("height")).toBe("20");
  });

  it("applies sharp stroke attributes", () => {
    const { container } = render(<Icon icon={LayoutDashboard} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("stroke-linecap")).toBe("square");
    expect(svg?.getAttribute("stroke-linejoin")).toBe("miter");
    expect(svg?.getAttribute("stroke-width")).toBe("1.5");
  });

  it("accepts custom size", () => {
    const { container } = render(<Icon icon={LayoutDashboard} size={16} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("16");
  });

  it("accepts custom color", () => {
    const { container } = render(<Icon icon={LayoutDashboard} color="#1C62F2" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("stroke")).toBe("#1C62F2");
  });
});
```

- [ ] **Step 3: Run test**

Run: `cd frontend && npx jest src/__tests__/ui/Icon.test.tsx --no-coverage 2>&1 | tail -20`
Expected: All 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ui/Icon.tsx frontend/src/__tests__/ui/Icon.test.tsx
git commit -m "feat(ui): add Icon wrapper — sharp Lucide icons with miter joins"
```

---

### Task 3: Dark Theme — globals.css Update

**Files:**
- Modify: `frontend/src/app/globals.css:8-103` (`:root` section)

**Context:** The `:root` currently uses a light palette (#F8FAFC backgrounds, #0F172A text). Update values IN-PLACE to dark palette. Variable NAMES stay the same so all existing pages get the theme automatically.

- [ ] **Step 1: Update `:root` CSS variables**

In `frontend/src/app/globals.css`, update the `:root` block. Replace the light palette values (lines ~10-25) with dark values:

```css
/* BEFORE (light) */
--bg-deep: #F8FAFC;
--bg-sub: #F1F5F9;
--bg-panel: #FFFFFF;
--border-rim: #E2E8F0;
--border-soft: #CBD5E1;
--text-primary: #0F172A;
--text-secondary: #334155;
--text-tertiary: #94A3B8;

/* AFTER (dark) */
--bg-deep: #111827;
--bg-sub: #293548;
--bg-panel: #1F2937;
--border-rim: #374151;
--border-soft: #1F2937;
--text-primary: #E5E7EB;
--text-secondary: #9CA3AF;
--text-tertiary: #6B7280;
```

Also add new variables:
```css
--bg-sidebar: #0B1120;
--text-disabled: #374151;
--accent-blue: #1C62F2;
--accent-blue-dim: rgba(28, 98, 242, 0.10);
--status-pass: #059669;
--status-fail: #DC2626;
--status-warn: #D97706;
```

Update font variables:
```css
--font-ui: 'IBM Plex Sans', sans-serif;  /* was 'Inter' */
--font-mono: 'IBM Plex Mono', monospace;  /* was 'JetBrains Mono' */
```

Also add focus-visible style for accessibility:
```css
*:focus-visible {
  outline: 2px solid var(--accent-blue);
  outline-offset: 2px;
}
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx next build 2>&1 | tail -10`
Expected: Build succeeds. All pages now render with dark theme via CSS variables.

- [ ] **Step 3: Verify TypeScript**

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -10`
Expected: Zero errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/globals.css
git commit -m "feat(theme): switch to dark monochrome palette — update :root CSS variables"
```

---

## Chunk 2: Shared Components

### Task 4: ActionButton

**Files:**
- Create: `frontend/src/components/ui/ActionButton.tsx`
- Test: `frontend/src/__tests__/ui/ActionButton.test.tsx`

- [ ] **Step 1: Create component**

```tsx
// frontend/src/components/ui/ActionButton.tsx
import { T } from "@/lib/design/tokens";

type Variant = "primary" | "secondary" | "ghost";

interface ActionButtonProps {
  variant?: Variant;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  type?: "button" | "submit";
  style?: React.CSSProperties;
}

const variantStyles: Record<Variant, React.CSSProperties> = {
  primary: {
    background: T.accent,
    color: "#FFFFFF",
    border: "none",
  },
  secondary: {
    background: "transparent",
    color: T.primary,
    border: `1px solid ${T.rim}`,
  },
  ghost: {
    background: "transparent",
    color: T.secondary,
    border: "none",
  },
};

export function ActionButton({
  variant = "primary",
  disabled = false,
  onClick,
  children,
  type = "button",
  style,
}: ActionButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onClick}
      style={{
        fontFamily: T.fontUI,
        fontSize: 13,
        fontWeight: 600,
        padding: "8px 16px",
        borderRadius: 3,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "opacity 100ms",
        ...variantStyles[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Write test**

```tsx
// frontend/src/__tests__/ui/ActionButton.test.tsx
import { render, fireEvent } from "@testing-library/react";
import { ActionButton } from "@/components/ui/ActionButton";

describe("ActionButton", () => {
  it("renders children", () => {
    const { getByText } = render(<ActionButton>Click me</ActionButton>);
    expect(getByText("Click me")).toBeTruthy();
  });

  it("calls onClick when not disabled", () => {
    const fn = jest.fn();
    const { getByText } = render(<ActionButton onClick={fn}>Go</ActionButton>);
    fireEvent.click(getByText("Go"));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", () => {
    const fn = jest.fn();
    const { getByText } = render(<ActionButton onClick={fn} disabled>Go</ActionButton>);
    fireEvent.click(getByText("Go"));
    expect(fn).not.toHaveBeenCalled();
  });

  it("sets aria-disabled when disabled", () => {
    const { getByText } = render(<ActionButton disabled>Go</ActionButton>);
    expect(getByText("Go").getAttribute("aria-disabled")).toBe("true");
  });

  it("renders secondary variant with border", () => {
    const { getByText } = render(<ActionButton variant="secondary">Go</ActionButton>);
    expect(getByText("Go").style.background).toBe("transparent");
  });

  it("renders ghost variant", () => {
    const { getByText } = render(<ActionButton variant="ghost">Go</ActionButton>);
    expect(getByText("Go").style.border).toBe("none");
  });
});
```

- [ ] **Step 3: Run test, verify pass**

Run: `cd frontend && npx jest src/__tests__/ui/ActionButton.test.tsx --no-coverage 2>&1 | tail -20`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ui/ActionButton.tsx frontend/src/__tests__/ui/ActionButton.test.tsx
git commit -m "feat(ui): add ActionButton — primary/secondary/ghost variants"
```

---

### Task 5: KpiStrip

**Files:**
- Create: `frontend/src/components/ui/KpiStrip.tsx`
- Test: `frontend/src/__tests__/ui/KpiStrip.test.tsx`

- [ ] **Step 1: Create component**

```tsx
// frontend/src/components/ui/KpiStrip.tsx
import { T } from "@/lib/design/tokens";

interface KpiItem {
  label: string;
  value: string | number;
  color?: string;
}

interface KpiStripProps {
  items: KpiItem[];
  loading?: boolean;
}

export function KpiStrip({ items, loading }: KpiStripProps) {
  if (loading) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${items.length || 4}, 1fr)`, gap: 1, background: T.rim, border: `1px solid ${T.rim}`, borderRadius: 4, overflow: "hidden" }}>
        {Array.from({ length: items.length || 4 }).map((_, i) => (
          <div key={i} style={{ background: T.bgPanel, padding: "14px 16px" }}>
            <div style={{ height: 12, width: 80, background: T.soft, borderRadius: 2, marginBottom: 6 }} />
            <div style={{ height: 18, width: 60, background: T.soft, borderRadius: 2 }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 1, background: T.rim, border: `1px solid ${T.rim}`, borderRadius: 4, overflow: "hidden" }}>
      {items.map((item) => (
        <div key={item.label} style={{ background: T.bgPanel, padding: "14px 16px" }}>
          <div style={{ fontFamily: T.fontUI, fontSize: 12, fontWeight: 500, color: T.tertiary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {item.label}
          </div>
          <div style={{ fontFamily: T.fontMono, fontSize: 16, fontWeight: 700, color: item.color || T.primary, marginTop: 4 }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Write test**

```tsx
// frontend/src/__tests__/ui/KpiStrip.test.tsx
import { render } from "@testing-library/react";
import { KpiStrip } from "@/components/ui/KpiStrip";

const items = [
  { label: "Exposure", value: "$24.8M" },
  { label: "Coverage", value: "67%" },
  { label: "Pending", value: 2 },
];

describe("KpiStrip", () => {
  it("renders all items", () => {
    const { getByText } = render(<KpiStrip items={items} />);
    expect(getByText("Exposure")).toBeTruthy();
    expect(getByText("$24.8M")).toBeTruthy();
    expect(getByText("Coverage")).toBeTruthy();
    expect(getByText("67%")).toBeTruthy();
    expect(getByText("Pending")).toBeTruthy();
    expect(getByText("2")).toBeTruthy();
  });

  it("renders loading skeleton when loading", () => {
    const { container } = render(<KpiStrip items={items} loading />);
    expect(container.textContent).not.toContain("Exposure");
  });

  it("applies custom color to value", () => {
    const colored = [{ label: "P&L", value: "+$142K", color: "var(--status-pass)" }];
    const { getByText } = render(<KpiStrip items={colored} />);
    expect(getByText("+$142K").style.color).toBe("var(--status-pass)");
  });
});
```

- [ ] **Step 3: Run test, verify pass**

Run: `cd frontend && npx jest src/__tests__/ui/KpiStrip.test.tsx --no-coverage 2>&1 | tail -20`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ui/KpiStrip.tsx frontend/src/__tests__/ui/KpiStrip.test.tsx
git commit -m "feat(ui): add KpiStrip — horizontal stat bar with loading skeleton"
```

---

### Task 6: StatusDot

**Files:**
- Create: `frontend/src/components/ui/StatusDot.tsx`
- Test: `frontend/src/__tests__/ui/StatusDot.test.tsx`

- [ ] **Step 1: Create component**

```tsx
// frontend/src/components/ui/StatusDot.tsx
import { T } from "@/lib/design/tokens";

type Status = "pass" | "fail" | "warn" | "neutral";

const colorMap: Record<Status, string> = {
  pass: T.pass,
  fail: T.fail,
  warn: T.warn,
  neutral: T.tertiary,
};

interface StatusDotProps {
  status: Status;
  size?: number;
  label?: string;
}

export function StatusDot({ status, size = 8, label }: StatusDotProps) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        role="img"
        aria-label={label || status}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: colorMap[status],
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      {label && (
        <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.secondary }}>
          {label}
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Write test**

```tsx
// frontend/src/__tests__/ui/StatusDot.test.tsx
import { render } from "@testing-library/react";
import { StatusDot } from "@/components/ui/StatusDot";

describe("StatusDot", () => {
  it("renders pass dot", () => {
    const { container } = render(<StatusDot status="pass" />);
    const dot = container.querySelector("[role='img']");
    expect(dot?.style.background).toBe("var(--status-pass)");
  });

  it("renders fail dot", () => {
    const { container } = render(<StatusDot status="fail" />);
    const dot = container.querySelector("[role='img']");
    expect(dot?.style.background).toBe("var(--status-fail)");
  });

  it("renders with label", () => {
    const { getByText } = render(<StatusDot status="pass" label="Active" />);
    expect(getByText("Active")).toBeTruthy();
  });

  it("uses custom size", () => {
    const { container } = render(<StatusDot status="warn" size={12} />);
    const dot = container.querySelector("[role='img']");
    expect(dot?.style.width).toBe("12px");
  });
});
```

- [ ] **Step 3: Run test, verify pass**

Run: `cd frontend && npx jest src/__tests__/ui/StatusDot.test.tsx --no-coverage 2>&1 | tail -20`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ui/StatusDot.tsx frontend/src/__tests__/ui/StatusDot.test.tsx
git commit -m "feat(ui): add StatusDot — pass/fail/warn/neutral status indicator"
```

---

### Task 7: PageHeader + PageShell

**Files:**
- Create: `frontend/src/components/layout/PageHeader.tsx`
- Create: `frontend/src/components/layout/PageShell.tsx`
- Test: `frontend/src/__tests__/layout/PageShell.test.tsx`

- [ ] **Step 1: Create PageHeader**

```tsx
// frontend/src/components/layout/PageHeader.tsx
import { T } from "@/lib/design/tokens";
import { Icon } from "@/components/ui/Icon";
import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  breadcrumb?: string[];
  actions?: React.ReactNode;
}

export function PageHeader({ icon, title, breadcrumb, actions }: PageHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 24px",
        borderBottom: `1px solid ${T.rim}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Icon icon={icon} size={20} color={T.tertiary} />
        <div>
          <div style={{ fontFamily: T.fontUI, fontSize: 16, fontWeight: 600, color: T.primary }}>
            {title}
          </div>
          {breadcrumb && breadcrumb.length > 0 && (
            <nav aria-label="Breadcrumb">
              <div style={{ fontFamily: T.fontUI, fontSize: 12, color: T.tertiary, marginTop: 2 }}>
                {breadcrumb.join(" → ")}
              </div>
            </nav>
          )}
        </div>
      </div>
      {actions && <div style={{ display: "flex", gap: 8 }}>{actions}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Create PageShell**

```tsx
// frontend/src/components/layout/PageShell.tsx
import { T } from "@/lib/design/tokens";
import { PageHeader } from "./PageHeader";
import type { LucideIcon } from "lucide-react";

interface PageShellProps {
  icon: LucideIcon;
  title: string;
  breadcrumb?: string[];
  actions?: React.ReactNode;
  noPadding?: boolean;
  children: React.ReactNode;
}

export function PageShell({ icon, title, breadcrumb, actions, noPadding, children }: PageShellProps) {
  return (
    <div style={{ minHeight: "100vh", background: T.bgDeep }}>
      <PageHeader icon={icon} title={title} breadcrumb={breadcrumb} actions={actions} />
      <div style={noPadding ? undefined : { padding: "24px 28px" }}>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write test**

```tsx
// frontend/src/__tests__/layout/PageShell.test.tsx
import { render } from "@testing-library/react";
import { PageShell } from "@/components/layout/PageShell";
import { Microscope } from "lucide-react";

describe("PageShell", () => {
  it("renders title", () => {
    const { getByText } = render(
      <PageShell icon={Microscope} title="Audit Lab">
        <p>Content</p>
      </PageShell>
    );
    expect(getByText("Audit Lab")).toBeTruthy();
  });

  it("renders breadcrumb", () => {
    const { getByText } = render(
      <PageShell icon={Microscope} title="Audit Lab" breadcrumb={["Dashboard", "Audit Lab"]}>
        <p>Content</p>
      </PageShell>
    );
    expect(getByText("Dashboard → Audit Lab")).toBeTruthy();
  });

  it("renders children", () => {
    const { getByText } = render(
      <PageShell icon={Microscope} title="Test"><p>Hello</p></PageShell>
    );
    expect(getByText("Hello")).toBeTruthy();
  });

  it("renders actions slot", () => {
    const { getByText } = render(
      <PageShell icon={Microscope} title="Test" actions={<button>Run</button>}>
        <p>Content</p>
      </PageShell>
    );
    expect(getByText("Run")).toBeTruthy();
  });

  it("has breadcrumb nav with aria-label", () => {
    const { container } = render(
      <PageShell icon={Microscope} title="Test" breadcrumb={["A", "B"]}>
        <p>C</p>
      </PageShell>
    );
    const nav = container.querySelector("nav[aria-label='Breadcrumb']");
    expect(nav).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run test, verify pass**

Run: `cd frontend && npx jest src/__tests__/layout/PageShell.test.tsx --no-coverage 2>&1 | tail -20`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/PageHeader.tsx frontend/src/components/layout/PageShell.tsx frontend/src/__tests__/layout/PageShell.test.tsx
git commit -m "feat(layout): add PageShell + PageHeader — shared page wrapper with breadcrumb"
```

---

### Task 8: DataTable

**Files:**
- Create: `frontend/src/components/ui/DataTable.tsx`
- Test: `frontend/src/__tests__/ui/DataTable.test.tsx`

- [ ] **Step 1: Create component**

```tsx
// frontend/src/components/ui/DataTable.tsx
import { useState } from "react";
import { T } from "@/lib/design/tokens";

interface Column<T> {
  key: keyof T & string;
  label: string;
  sortable?: boolean;
  render?: (value: T[keyof T], row: T) => React.ReactNode;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  loading,
  emptyMessage = "No data",
  onRowClick,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = sortKey
    ? [...data].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (av == null || bv == null) return 0;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === "asc" ? cmp : -cmp;
      })
    : data;

  const headStyle: React.CSSProperties = {
    fontFamily: T.fontUI,
    fontSize: 12,
    fontWeight: 600,
    color: T.tertiary,
    textAlign: "left",
    padding: "10px 14px",
    borderBottom: `1px solid ${T.rim}`,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    whiteSpace: "nowrap",
    userSelect: "none",
  };

  const cellStyle: React.CSSProperties = {
    fontFamily: T.fontMono,
    fontSize: 13,
    color: T.primary,
    padding: "10px 14px",
    borderBottom: `1px solid ${T.soft}`,
  };

  if (loading) {
    return (
      <div style={{ background: T.bgPanel, border: `1px solid ${T.rim}`, borderRadius: 4, padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontFamily: T.fontUI, fontSize: 13, color: T.tertiary }}>Loading...</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div style={{ background: T.bgPanel, border: `1px solid ${T.rim}`, borderRadius: 4, padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontFamily: T.fontUI, fontSize: 13, color: T.tertiary }}>{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div style={{ background: T.bgPanel, border: `1px solid ${T.rim}`, borderRadius: 4, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: T.bgSub }}>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{ ...headStyle, cursor: col.sortable ? "pointer" : "default", width: col.width }}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                {col.label}
                {sortKey === col.key && (sortDir === "asc" ? " \u2191" : " \u2193")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{ cursor: onRowClick ? "pointer" : "default" }}
            >
              {columns.map((col) => (
                <td key={col.key} style={cellStyle}>
                  {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Write test**

```tsx
// frontend/src/__tests__/ui/DataTable.test.tsx
import { render, fireEvent } from "@testing-library/react";
import { DataTable } from "@/components/ui/DataTable";

type Row = { name: string; value: number };

const columns = [
  { key: "name" as const, label: "Name", sortable: true },
  { key: "value" as const, label: "Value", sortable: true },
];

const data: Row[] = [
  { name: "EUR/USD", value: 1.08 },
  { name: "GBP/USD", value: 1.27 },
];

describe("DataTable", () => {
  it("renders all rows", () => {
    const { getByText } = render(<DataTable columns={columns} data={data} />);
    expect(getByText("EUR/USD")).toBeTruthy();
    expect(getByText("GBP/USD")).toBeTruthy();
  });

  it("renders column headers", () => {
    const { getByText } = render(<DataTable columns={columns} data={data} />);
    expect(getByText("Name")).toBeTruthy();
    expect(getByText("Value")).toBeTruthy();
  });

  it("shows empty message when no data", () => {
    const { getByText } = render(<DataTable columns={columns} data={[]} emptyMessage="No positions" />);
    expect(getByText("No positions")).toBeTruthy();
  });

  it("shows loading state", () => {
    const { getByText } = render(<DataTable columns={columns} data={[]} loading />);
    expect(getByText("Loading...")).toBeTruthy();
  });

  it("sorts on header click", () => {
    const { getByText, container } = render(<DataTable columns={columns} data={data} />);
    fireEvent.click(getByText("Name"));
    const cells = container.querySelectorAll("td");
    expect(cells[0]?.textContent).toBe("EUR/USD");
  });

  it("calls onRowClick", () => {
    const fn = jest.fn();
    const { getByText } = render(<DataTable columns={columns} data={data} onRowClick={fn} />);
    fireEvent.click(getByText("EUR/USD"));
    expect(fn).toHaveBeenCalledWith(data[0]);
  });
});
```

- [ ] **Step 3: Run test, verify pass**

Run: `cd frontend && npx jest src/__tests__/ui/DataTable.test.tsx --no-coverage 2>&1 | tail -20`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ui/DataTable.tsx frontend/src/__tests__/ui/DataTable.test.tsx
git commit -m "feat(ui): add DataTable — sortable table with loading/empty states"
```

- [ ] **Step 5: Verify full build**

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -5 && npx next build 2>&1 | tail -5`
Expected: Both pass with zero errors.

- [ ] **Step 6: Commit build verification**

No code change — just verification checkpoint.

---

## Chunk 3: Sidebar Rebuild

### Task 9: AppSidebar Full Rewrite

**Files:**
- Modify: `frontend/src/components/layout/AppSidebar.tsx` (full rewrite of icon definitions + NAV array)

**Context:** Currently ~1020 lines. The Ic object (lines 65-212) has 30+ hand-drawn SVG icons. The NAV array (lines 244-375) has 10 sections. Rewrite to use Lucide icons via the Icon component, 7+3 sections, open by default, visual tiers.

- [ ] **Step 1: Replace all custom SVG icons with Lucide imports**

At the top of `AppSidebar.tsx`, add Lucide imports and remove the entire `Ic` object (lines 65-212):

```tsx
import {
  LayoutDashboard, Play, FileText, Microscope, BarChart3,
  Zap, Globe, Settings, Monitor, HelpCircle,
  // Sub-item icons
  Upload, Scale, Shield, Book, Clock, Terminal, Plug,
  ChevronRight, LogOut, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { Icon } from "@/components/ui/Icon";
```

- [ ] **Step 2: Rewrite NAV array with 7+3 sections**

Replace the NAV array (lines 244-375) with the new structure from spec Section 4.2. Key changes:
- Remove ORDR Market, Connectors, Decisions, Effectiveness sections
- Add Market Overview section
- Absorb Effectiveness into Hedge Desk (COMPLIANCE group)
- Absorb Connectors into Settings
- Update all icons from `Ic.xxx` JSX to Lucide component references

- [ ] **Step 3: Change default sidebar state to OPEN**

In the useState initialization (~line 701), change:
```tsx
// BEFORE
const [expanded, setExpanded] = useState(() =>
  localStorage.getItem("ordr_sidebar_expanded") === "true"
);

// AFTER
const [expanded, setExpanded] = useState(() => {
  const stored = localStorage.getItem("ordr_sidebar_expanded");
  return stored === null ? true : stored === "true";  // Default OPEN on first visit
});
```

- [ ] **Step 4: Apply visual tiers (PRIMARY / SECONDARY / UTILITY)**

Add divider lines between tier groups. Apply color tiers:
- PRIMARY sections: icon `#9CA3AF`, text `#E5E7EB`
- SECONDARY sections: icon `#6B7280`, text `#9CA3AF`
- UTILITY sections: icon `#4A5A74`, text `#6B7280`

- [ ] **Step 5: Replace flyout panels with tooltips**

Remove the FlyoutPanel component. Replace with a simple tooltip (title attribute or a minimal tooltip div) on hover for collapsed mode.

- [ ] **Step 6: Add ARIA attributes**

- Wrap sidebar in `<nav role="navigation" aria-label="Main navigation">`
- Active item gets `aria-current="page"`

- [ ] **Step 7: Remove all colored badges from sidebar nav items**

Remove all `badge` and `badgeColor` properties from NAV items. The monochrome palette means no colored badges on UI chrome.

- [ ] **Step 8: Verify build**

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -5 && npx next build 2>&1 | tail -5`
Expected: Both pass.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/layout/AppSidebar.tsx
git commit -m "feat(nav): rebuild sidebar — Lucide sharp icons, 7+3 sections, open default, monochrome"
```

---

## Chunk 4: Dashboard Mission Control

### Task 10: Dashboard Rewrite

**Files:**
- Modify: `frontend/src/app/dashboard/page.tsx` (full rewrite — currently 228 lines)

**Context:** Currently renders a 2x2 widget grid with WidgetErrorBoundary. Replace with Mission Control: greeting + 3 live-data cards + KpiStrip. Widget components stay in codebase but are not imported.

- [ ] **Step 1: Rewrite dashboard page**

Replace the entire content of `dashboard/page.tsx`. Key elements:
- Greeting bar: `useAuth()` → `user.full_name`, `user.company?.name`, `user.roles[0]`, current date
- 3 Mission Cards: New Hedge (count from `/v1/positions`), Monitor (count from `/v1/positions`), Market Data (spot from `/v1/market-data/status`)
- KpiStrip below cards: Total Exposure, Hedge Coverage, Pending Approvals, MTM P&L, Open Positions
- Use `dashboardFetch` for all API calls
- Use `T` tokens from `@/lib/design/tokens`
- Use `PageShell` wrapper with `LayoutDashboard` icon
- Cards are clickable links: `/hedge-desk?mode=run`, `/hedge-monitor`, `/market-overview`
- Auto-refresh every 60s via `useEffect` interval
- Loading state: skeleton (gray blocks matching card shape)

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -5 && npx next build 2>&1 | tail -5`
Expected: Both pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/dashboard/page.tsx
git commit -m "feat(dashboard): Mission Control — greeting, 3 live-data cards, KPI strip"
```

---

## Chunk 5: Page Deletions, Merges, Reference Sweep

### Task 11: Delete Legacy Pages

**Files to delete:**
- `frontend/src/app/execution/` (entire directory)
- `frontend/src/app/decision-desk/` (entire directory, including `runs/[run_id]/`)
- `frontend/src/app/currency-fx/` (entire directory)
- `frontend/src/app/execution-history/` (entire directory)
- `frontend/src/app/access-control/` (entire directory)
- `frontend/src/app/position-desk/import/` (nested route, absorbed)

- [ ] **Step 1: Delete directories**

```bash
cd frontend/src/app
rm -rf execution decision-desk currency-fx execution-history access-control position-desk/import
```

- [ ] **Step 2: Verify build still passes**

Run: `cd frontend && npx next build 2>&1 | tail -10`
Expected: Build passes (deleted pages had no importers).

- [ ] **Step 3: Commit**

```bash
git add -A frontend/src/app/execution frontend/src/app/decision-desk frontend/src/app/currency-fx frontend/src/app/execution-history frontend/src/app/access-control frontend/src/app/position-desk/import
git commit -m "chore: delete 5 legacy pages — execution, decision-desk, currency-fx, execution-history, access-control"
```

---

### Task 12: Merge Policy Pages (4 → 1 Tabbed)

**Files:**
- Modify: `frontend/src/app/policies/page.tsx` — add tab system wrapping existing components
- Delete after merge: `frontend/src/app/saved-policies/page.tsx`, `frontend/src/app/policy-desk/page.tsx`, `frontend/src/app/policy-dashboard/page.tsx`

**Strategy:** Extract the main content from each page into a component, then create a tabbed layout in `/policies` that renders the correct component per tab. Existing code logic is preserved — only the page wrapper changes.

- [ ] **Step 1: Read all 4 policy pages to understand their exports and state**

Read: `frontend/src/app/policies/page.tsx`, `frontend/src/app/saved-policies/page.tsx`, `frontend/src/app/policy-desk/page.tsx`, `frontend/src/app/policy-dashboard/page.tsx`

- [ ] **Step 2: Create tab wrapper in `/policies/page.tsx`**

Add tab navigation at the top of the policies page. Tabs: LIBRARY (default), MY POLICIES, ASSIGN, ANALYTICS. Read `?tab=` from URL search params. Each tab lazy-renders the existing page content.

- [ ] **Step 3: Extract page content from saved-policies, policy-desk, policy-dashboard into importable components**

Move each page's main content into:
- `frontend/src/components/policy/PolicyLibraryTab.tsx` (existing policies content)
- `frontend/src/components/policy/SavedPoliciesTab.tsx` (from saved-policies)
- `frontend/src/components/policy/PolicyAssignTab.tsx` (from policy-desk)
- `frontend/src/components/policy/PolicyAnalyticsTab.tsx` (from policy-dashboard)

- [ ] **Step 4: Delete original page files**

```bash
rm frontend/src/app/saved-policies/page.tsx
rm frontend/src/app/policy-desk/page.tsx
rm frontend/src/app/policy-dashboard/page.tsx
```

- [ ] **Step 5: Verify build**

Run: `cd frontend && npx next build 2>&1 | tail -10`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(policies): merge 4 policy pages into tabbed layout — library, saved, assign, analytics"
```

---

### Task 13: Merge Position Pages (3 → 1)

**Files:**
- Modify: `frontend/src/app/position-desk/page.tsx` — add Add/Import modals
- Delete after merge: `frontend/src/app/input/page.tsx`, `frontend/src/app/upload-csv/page.tsx`

**Strategy:** Extract the form from `/input` into an `AddPositionDrawer` component. Extract the upload from `/upload-csv` into an `ImportCsvModal` component. Add two buttons to Position Desk's PageHeader actions: "Add" and "Import".

- [ ] **Step 1: Read input/page.tsx and upload-csv/page.tsx to understand their core logic**

- [ ] **Step 2: Extract input form into `components/position/AddPositionDrawer.tsx`**

Move the form logic (not the page wrapper) into a drawer component. Props: `{ open, onClose, token, onSuccess }`.

- [ ] **Step 3: Extract upload into `components/position/ImportCsvModal.tsx`**

Move the CSV upload logic into a modal component. Props: `{ open, onClose, token, onSuccess }`.

- [ ] **Step 4: Add drawer/modal triggers to Position Desk page header**

In `position-desk/page.tsx`, add state for `showAdd` and `showImport`. Add ActionButton components in the PageHeader actions slot.

- [ ] **Step 5: Delete original pages**

```bash
rm frontend/src/app/input/page.tsx
rm frontend/src/app/upload-csv/page.tsx
```

- [ ] **Step 6: Verify build**

Run: `cd frontend && npx next build 2>&1 | tail -10`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(positions): merge input + upload-csv into position-desk modals"
```

---

### Task 14: Broken Reference Sweep + Redirects

**Files to modify:**
- `frontend/src/utils/pipelineNextStep.ts:67,82,97` — update route references
- `frontend/src/lib/helpContent.ts:33` — update `/input` references
- `frontend/src/components/dashboard/widgets/RecentRunsWidget.tsx` — `/input` → `/position-desk`
- `frontend/src/components/dashboard/widgets/ExposureSummaryWidget.tsx` — `/input` → `/position-desk`
- `frontend/src/components/dashboard/widgets/PolisophicMiniWidget.tsx` — `/input` → `/position-desk`
- `frontend/src/app/sandbox/page.tsx` — `/input` → `/position-desk`
- `frontend/src/app/run-viewer/page.tsx` — `/execution-history` → `/trade-history`
- `frontend/src/app/committee-pack/page.tsx` — `/execution-history` → `/trade-history`
- `frontend/next.config.js:15-21` — update redirect map

- [ ] **Step 1: Update pipelineNextStep.ts**

```
Line 67: href: "/input"      → href: "/position-desk"
Line 82: href: "/policy-desk" → href: "/policies?tab=assign"
Line 97: href: "/calculate"   → href: "/hedge-desk?mode=run"
```

- [ ] **Step 2: Grep and update ALL remaining `/input"` references**

Run: `cd frontend && grep -rn '"/input"' src/ --include='*.tsx' --include='*.ts'`
Update every match to `"/position-desk"`.

- [ ] **Step 3: Grep and update ALL `/policy-desk"` references**

Run: `cd frontend && grep -rn '"/policy-desk"' src/ --include='*.tsx' --include='*.ts'`
Update every match to `"/policies?tab=assign"`.

- [ ] **Step 4: Grep and update ALL `/execution-history"` references**

Run: `cd frontend && grep -rn '"/execution-history"' src/ --include='*.tsx' --include='*.ts'`
Update every match to `"/trade-history"`.

- [ ] **Step 5: Update next.config.js redirects**

Replace existing redirects (lines 15-21) with:

```js
async redirects() {
  return [
    { source: "/execution-desk", destination: "/hedge-desk", permanent: true },
    { source: "/currency-fx", destination: "/market-overview", permanent: true },
    { source: "/hedges", destination: "/position-desk", permanent: true },
    { source: "/input", destination: "/position-desk", permanent: true },
    { source: "/upload-csv", destination: "/position-desk", permanent: true },
    { source: "/calculate", destination: "/hedge-desk", permanent: true },
    { source: "/policy-desk", destination: "/policies", permanent: true },
    { source: "/saved-policies", destination: "/policies", permanent: true },
    { source: "/policy-dashboard", destination: "/policies", permanent: true },
    { source: "/execution", destination: "/hedge-desk", permanent: true },
    { source: "/decision-desk", destination: "/hedge-desk", permanent: true },
    { source: "/fx-market", destination: "/market-overview", permanent: true },
    { source: "/market-intelligence", destination: "/market-overview", permanent: true },
    { source: "/execution-history", destination: "/trade-history", permanent: true },
    { source: "/access-control", destination: "/settings", permanent: true },
  ];
},
```

- [ ] **Step 6: Verify no broken references remain**

Run: `cd frontend && grep -rn '"/input"' src/ && grep -rn '"/policy-desk"' src/ && grep -rn '"/execution-history"' src/ && grep -rn '"/calculate"' src/ && grep -rn '"/decision-desk"' src/ && grep -rn '"/currency-fx"' src/`
Expected: Zero matches (or only in comments/test fixtures).

- [ ] **Step 7: Verify build**

Run: `cd frontend && npx next build 2>&1 | tail -10`

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "fix(routes): sweep broken references + add 301 redirects for all deleted routes"
```

---

## Chunk 6: New Pages

### Task 15: Market Overview Page

**Files:**
- Create: `frontend/src/app/market-overview/page.tsx`
- Modify: `frontend/next.config.js` — add CSP headers for TradingView embeds

- [ ] **Step 1: Create Market Overview page**

Build a single page with PageShell wrapper (`BarChart3` icon) containing 6 boxes in a 3x2 grid:

1. **FX Heatmap** (own data): fetch from `/v1/market-data/status`, display 17 pairs in a color-coded strength grid (green/red based on daily change)
2. **Indices** (TradingView embed): `<iframe>` with TradingView mini-chart widget for SPX, UKX, DAX, NKY. Dark theme. `sandbox="allow-scripts allow-same-origin"`
3. **Commodities** (TradingView embed): Same pattern for XAUUSD, USOIL, XAGUSD
4. **Economic Calendar** (TradingView embed): TradingView economic calendar widget
5. **Technical Summary** (own data): RSI/MA signals table for major FX pairs from backend
6. **Volatility Gauge** (own data): VIX level + implied vol summary

Use `T` tokens throughout. Monochrome styling. No colored badges.

- [ ] **Step 2: Add CSP headers in next.config.js**

Add `headers()` function:
```js
async headers() {
  return [{
    source: '/market-overview',
    headers: [{
      key: 'Content-Security-Policy',
      value: "frame-src 'self' https://s.tradingview.com https://www.tradingview.com"
    }]
  }];
},
```

- [ ] **Step 3: Verify build + iframe sandbox**

Run: `cd frontend && npx next build 2>&1 | tail -10`
Then grep: `grep -n 'sandbox' src/app/market-overview/page.tsx` — must find sandbox attributes on all iframes.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/market-overview/page.tsx frontend/next.config.js
git commit -m "feat(market): add Market Overview — FX heatmap + TradingView embeds + CSP headers"
```

---

### Task 16: Audit Lab Public Demo

**Files:**
- Create: `frontend/src/app/audit-lab/demo/page.tsx`
- Create: `frontend/src/lib/fixtures/audit-lab-demo.ts`

- [ ] **Step 1: Create demo fixture data**

```ts
// frontend/src/lib/fixtures/audit-lab-demo.ts

/**
 * Static sample dataset for the public Audit Lab demo.
 * No API calls — all data is hardcoded.
 */
export const DEMO_DATASET = {
  name: "Sample Corporation — Q4 2025 FX Audit",
  periods: [
    { label: "Q3 2025", start: "2025-07-01", end: "2025-09-30" },
    { label: "Q4 2025", start: "2025-10-01", end: "2025-12-31" },
  ],
  positions: [
    { currency: "EUR", amount: 5_000_000, hedgedAmount: 3_500_000, rate: 1.0847, hedgeRate: 1.0920, maturity: "2026-03-15" },
    { currency: "GBP", amount: 2_000_000, hedgedAmount: 1_400_000, rate: 1.2710, hedgeRate: 1.2680, maturity: "2026-06-30" },
    { currency: "JPY", amount: 500_000_000, hedgedAmount: 350_000_000, rate: 149.50, hedgeRate: 148.80, maturity: "2026-01-31" },
  ],
  auditResults: {
    totalExposureUsd: 11_200_000,
    hedgedExposureUsd: 7_840_000,
    coverageRatio: 0.70,
    markupBps: 12,
    unhedgedVarianceUsd: 168_000,
    totalCostBps: 28,
  },
};
```

- [ ] **Step 2: Create demo page**

```tsx
// frontend/src/app/audit-lab/demo/page.tsx
"use client";

/**
 * /audit-lab/demo — Public demo (no auth required).
 * Uses static fixture data. No API calls. No useAuth().
 */

import { DEMO_DATASET } from "@/lib/fixtures/audit-lab-demo";
import { T } from "@/lib/design/tokens";
import { KpiStrip } from "@/components/ui/KpiStrip";
import { ActionButton } from "@/components/ui/ActionButton";
import Link from "next/link";

export default function AuditLabDemoPage() {
  const d = DEMO_DATASET;

  return (
    <div style={{ minHeight: "100vh", background: T.bgDeep, padding: "28px 40px", fontFamily: T.fontUI }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 600, color: T.tertiary, letterSpacing: "0.1em", marginBottom: 6 }}>
          AUDIT LAB — DEMO
        </div>
        <div style={{ fontFamily: T.fontUI, fontSize: 20, fontWeight: 700, color: T.primary }}>
          {d.name}
        </div>
        <div style={{ fontFamily: T.fontUI, fontSize: 13, color: T.secondary, marginTop: 4 }}>
          Try the Audit Lab with sample data. No account required.
        </div>
      </div>

      {/* KPIs */}
      <KpiStrip items={[
        { label: "Total Exposure", value: `$${(d.auditResults.totalExposureUsd / 1e6).toFixed(1)}M` },
        { label: "Hedged", value: `$${(d.auditResults.hedgedExposureUsd / 1e6).toFixed(1)}M` },
        { label: "Coverage", value: `${(d.auditResults.coverageRatio * 100).toFixed(0)}%` },
        { label: "Markup", value: `${d.auditResults.markupBps} bps` },
        { label: "Unhedged Variance", value: `$${(d.auditResults.unhedgedVarianceUsd / 1e3).toFixed(0)}K` },
      ]} />

      {/* Position table */}
      <div style={{ marginTop: 24, background: T.bgPanel, border: `1px solid ${T.rim}`, borderRadius: 4, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: T.bgSub }}>
              {["Currency", "Notional", "Hedged", "Spot Rate", "Hedge Rate", "Maturity"].map(h => (
                <th key={h} style={{ fontFamily: T.fontUI, fontSize: 12, fontWeight: 600, color: T.tertiary, textAlign: "left", padding: "10px 14px", borderBottom: `1px solid ${T.rim}`, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.positions.map(p => (
              <tr key={p.currency} style={{ borderBottom: `1px solid ${T.soft}` }}>
                <td style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 700, color: T.primary, padding: "10px 14px" }}>{p.currency}</td>
                <td style={{ fontFamily: T.fontMono, fontSize: 13, color: T.primary, padding: "10px 14px" }}>{p.amount.toLocaleString()}</td>
                <td style={{ fontFamily: T.fontMono, fontSize: 13, color: T.primary, padding: "10px 14px" }}>{p.hedgedAmount.toLocaleString()}</td>
                <td style={{ fontFamily: T.fontMono, fontSize: 13, color: T.secondary, padding: "10px 14px" }}>{p.rate}</td>
                <td style={{ fontFamily: T.fontMono, fontSize: 13, color: T.secondary, padding: "10px 14px" }}>{p.hedgeRate}</td>
                <td style={{ fontFamily: T.fontMono, fontSize: 13, color: T.tertiary, padding: "10px 14px" }}>{p.maturity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* CTA */}
      <div style={{ marginTop: 40, padding: "32px 24px", background: T.bgPanel, border: `1px solid ${T.rim}`, borderRadius: 4, textAlign: "center" }}>
        <div style={{ fontFamily: T.fontUI, fontSize: 16, fontWeight: 600, color: T.primary, marginBottom: 8 }}>
          See the full picture
        </div>
        <div style={{ fontFamily: T.fontUI, fontSize: 13, color: T.secondary, marginBottom: 20 }}>
          Upload your own data, compare periods, track trends, and verify hedge effectiveness.
        </div>
        <Link href="/auth/login">
          <ActionButton>Create your free account</ActionButton>
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify the demo page does NOT import useAuth or dashboardFetch**

Run: `grep -n "useAuth\|dashboardFetch\|token" frontend/src/app/audit-lab/demo/page.tsx`
Expected: Zero matches (the page must make zero API calls and not access auth).

- [ ] **Step 4: Verify build**

Run: `cd frontend && npx next build 2>&1 | tail -10`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/audit-lab/demo/page.tsx frontend/src/lib/fixtures/audit-lab-demo.ts
git commit -m "feat(audit-lab): add public demo mode — static data, no auth, conversion CTA"
```

---

## Chunk 7: Final Audit Pass

### Task 17: Apply PageShell to All Remaining Pages

**Context:** Every authenticated page must be wrapped in `<PageShell>`. This is a bulk operation across ~30 pages. For each page: import PageShell + relevant Lucide icon, wrap the page content, remove the custom header if it duplicates PageShell functionality.

- [ ] **Step 1: List all page.tsx files that need PageShell**

Run: `find frontend/src/app -name "page.tsx" | grep -v node_modules | sort`

Exclude: `/` (landing), `/auth/*`, `/market` (public), `/chart` (public), `/terminal`, `/audit-lab/demo` (public), `/welcome`, `/api-health`, `*-oauth-callback`.

- [ ] **Step 2: For each page, add PageShell wrapper**

Pattern for each page:
```tsx
import { PageShell } from "@/components/layout/PageShell";
import { SomeIcon } from "lucide-react";

// Wrap existing return in:
<PageShell icon={SomeIcon} title="Page Title" breadcrumb={["Dashboard", "Page Title"]}>
  {/* existing page content */}
</PageShell>
```

Icon assignments per section:
- Dashboard pages: `LayoutDashboard`
- Hedge Desk pages: `Play`
- Reports pages: `FileText`
- Audit Lab pages: `Microscope`
- Research pages: `Zap`
- Governance pages: `Globe`
- Settings: `Settings`
- Admin: `Monitor`
- Help: `HelpCircle`

- [ ] **Step 3: Verify build after each batch of 5 pages**

Run: `cd frontend && npx next build 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(shell): wrap all authenticated pages in PageShell"
```

---

### Task 18: 12px Minimum Font Enforcement

- [ ] **Step 1: Find all font-size violations**

Run: `cd frontend && grep -rn "fontSize.*[: ][89]\b" src/app/ src/components/ --include='*.tsx' | head -50`
Also: `grep -rn "fontSize.*10\b\|fontSize.*11\b" src/app/ src/components/ --include='*.tsx' | head -50`

- [ ] **Step 2: Update all violations to minimum 12px**

For each match:
- `fontSize: 9` → `fontSize: 12`
- `fontSize: 10` → `fontSize: 12`
- `fontSize: 11` → `fontSize: 12`

Exception: Preserved Hedge Desk pipeline phases — update these too since it's a CSS-level change, not logic.

- [ ] **Step 3: Remove colored badges from ALL sidebar references**

Verify no `badgeColor` or `badge` props remain in the NAV array.

- [ ] **Step 4: Verify build**

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -5 && npx next build 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(a11y): enforce 12px minimum font size + remove colored badges from chrome"
```

---

### Task 19: Security Audit + Final Verification

- [ ] **Step 1: Run security checklist**

Verify each item from spec Section 10.4:
```bash
# No new secrets
grep -rn "sk-\|pk_\|secret\|password\|API_KEY" frontend/src/ --include='*.tsx' --include='*.ts' | grep -v node_modules | grep -v test

# No localStorage PII
grep -rn "localStorage.*email\|localStorage.*name\|localStorage.*token" frontend/src/ --include='*.tsx' --include='*.ts'

# CSP configured
grep -n "Content-Security-Policy" frontend/next.config.js

# iframe sandbox
grep -n "sandbox" frontend/src/app/market-overview/page.tsx

# Demo page isolation
grep -n "useAuth\|dashboardFetch\|/v1/" frontend/src/app/audit-lab/demo/page.tsx

# RBAC tier gating preserved
grep -n "minTier\|teamOnly\|superuserOnly" frontend/src/components/layout/AppSidebar.tsx
```

- [ ] **Step 2: Run full test suite**

```bash
# Frontend
cd frontend && npx tsc --noEmit && npx next build

# Backend (ensure no regressions)
cd ../backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short 2>&1 | tail -10
```

- [ ] **Step 3: Verify zero grep matches for deleted routes**

```bash
cd frontend && grep -rn '"/input"' src/ --include='*.tsx' --include='*.ts' && grep -rn '"/policy-desk"' src/ --include='*.tsx' --include='*.ts' && grep -rn '"/decision-desk"' src/ --include='*.tsx' --include='*.ts'
```
Expected: Zero matches.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "audit: security checklist pass + full build verification + route sweep clean"
```

---

## Execution Summary

| Chunk | Tasks | Estimated Commits |
|-------|-------|-------------------|
| 1: Design Foundation | Tasks 1-3 (tokens, Icon, dark theme) | 3 |
| 2: Shared Components | Tasks 4-8 (ActionButton, KpiStrip, StatusDot, PageShell, DataTable) | 5 |
| 3: Sidebar | Task 9 (full rewrite) | 1 |
| 4: Dashboard | Task 10 (Mission Control) | 1 |
| 5: Deletions & Merges | Tasks 11-14 (delete, merge policies, merge positions, ref sweep) | 4 |
| 6: New Pages | Tasks 15-16 (Market Overview, Audit Lab demo) | 2 |
| 7: Final Audit | Tasks 17-19 (PageShell rollout, 12px, security) | 3 |
| **Total** | **19 tasks** | **~19 commits** |
