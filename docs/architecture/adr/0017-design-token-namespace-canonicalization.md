# ADR-0017: Design Token Namespace Canonicalization

- **Status:** accepted
- **Date:** 2026-04-25
- **Deciders:** Frontend / Design system
- **Supersedes:** —

## Context

The `globals.css` `:root` block defines two parallel CSS variable namespaces
that name the same conceptual tokens:

1. **Canonical** — `--bg-deep`, `--bg-panel`, `--bg-sub`, `--bg-sidebar`,
   `--border-rim`, `--text-primary`, `--text-secondary`, `--accent-blue`,
   `--status-pass`, `--status-fail`, etc.
2. **Legacy "terminal"** — `--terminal-bg`, `--terminal-topbar-bg`,
   `--terminal-rail-bg`, `--terminal-workspace-bg`, `--terminal-panel-bg`,
   `--terminal-border`, `--terminal-text-*`, `--terminal-accent`,
   `--terminal-success`, `--terminal-warning`, `--terminal-danger`,
   `--terminal-row-height`, `--terminal-header-height`, `--terminal-topbar-height`,
   `--terminal-leftrail-collapsed`, `--terminal-leftrail-expanded`,
   `--terminal-rightrail-width`, plus `--terminal-space-1..8`.

`ThemeProvider.tsx` writes both sets at runtime, marking the second as
"Terminal duplicates (kept for backward compat)". A grep across `frontend/src`
shows **zero** React consumers of any `var(--terminal-*)` color or layout
variable. The exception is `--font-terminal` and `--font-terminal-mono`,
which the canonical token module (`@/lib/design/tokens.ts`) consumes for
font-family fallbacks; those font tokens stay.

The duplication confuses contributors: new code reaches for whichever name
appears in the file they're editing, and themes (light/dark/high-contrast)
must be kept in sync across both namespaces or risk subtle drift on the
unused legacy set.

## Decision

The canonical namespace is the **non-prefixed `--bg-*` / `--text-*` /
`--accent-*` / `--status-*` / `--border-*` / `--sidebar-*`** set. All React
code consumes these via the `T` object exported from
`@/lib/design/tokens.ts`. New tokens are added there.

The `--terminal-*` color and layout namespace is **deprecated**. The two
font tokens (`--font-terminal`, `--font-terminal-mono`) are retained because
they participate in the fallback chain inside `T.fontUI` / `T.fontMono`.

### What is kept

- `var(--font-terminal)` — font-family fallback inside `T.fontUI`
- `var(--font-terminal-mono)` — font-family fallback inside `T.fontMono`

### What is removed

In a follow-up implementation pass:

1. Remove the `--terminal-*` color, layout, and spacing variable assignments
   from the `varMap` block in `frontend/src/lib/theme/ThemeProvider.tsx`
   (currently lines 91–105 — the "Terminal duplicates (kept for backward
   compat)" block).
2. Remove the declarations of those same variables from
   `frontend/src/app/globals.css`.
3. Update `frontend/src/__tests__/theme/themeProvider.test.ts` to drop any
   assertions that read or set the deprecated namespace.

## Consequences

**Positive**

- Single source of truth for design tokens. Themes only need to be defined
  once per token, eliminating a class of "looks right in dev, drifts in
  prod" bugs.
- ESLint can enforce the canonical set without false positives — see
  ADR follow-up around hex literals and the 12px font floor.
- ~30 fewer custom-property writes per theme switch (small perf win on
  initial paint).

**Negative / Risk**

- Any external consumer (preview iframes, embed pages, third-party themes)
  that reads `var(--terminal-bg)` will lose its value. A repo-wide grep
  found no such consumers, but the cleanup PR must include a one-release
  deprecation window: log a `console.warn` from `ThemeProvider` if any
  `--terminal-*` request is detected via `getComputedStyle` on first paint.
  After the next minor release, drop the warning and the duplicate writes.

**Migration path**

Phase 1 (this sprint) — adopt the ADR; do not yet remove the duplicate
writes. New code must use the canonical namespace via `T`.

Phase 2 (next minor) — remove the duplicate writes from `ThemeProvider`
and the legacy declarations from `globals.css`. Update theme tests.

Phase 3 — add an ESLint rule that flags any inline `var(--terminal-*)`
in `.tsx` / `.ts` files (the colour/layout subset, not the font fallbacks)
to prevent regression.

## References

- `frontend/src/lib/design/tokens.ts` — canonical `T` object
- `frontend/src/lib/theme/ThemeProvider.tsx` — runtime CSS-var
  application (lines 91–105 are the duplicate block)
- `frontend/src/app/globals.css` — duplicate declarations
- `.claude/rules/frontend.md` — Design tokens from `globals.css`
- Frontend audit `docs/audits/2026-04-25-frontend-audit.md`
