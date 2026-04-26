# ADR-0018: Design System Scope — Marketing Site vs Institutional Terminal

- **Status:** accepted
- **Date:** 2026-04-25
- **Deciders:** Frontend / Design system
- **Supersedes:** —
- **Refines:** ADR-0017

## Context

ADR-0017 named `@/lib/design/tokens.ts` (`T`) the canonical token surface and
introduced ESLint guardrails: `no-restricted-syntax` warnings on (a) inline
`fontSize` literals below 12px and (b) hex literals on color-typed style
properties. The intent was to enforce institutional UI minimums and steer new
code toward tokens.

Running ESLint after the rule landed surfaced 2202 warnings. 622 of those
(28%) live in the public marketing site under `src/app/{about,contact,
security,privacy,terms,solutions/**,products/**}` plus the root `src/app/page.tsx`
and `src/components/marketing/**`. These pages share a `MarketingLayout`,
import a separate theme module (`@/components/marketing/theme`), use a
distinct typographic system (10–11px overlines, 17–22px body, 36–72px
heroes), and render against a white/gradient palette that has no
counterpart in the terminal token set.

Forcing marketing pages to satisfy the institutional rule would require
either (a) adding eslint-disable directives at hundreds of sites, (b)
inventing parallel marketing tokens inside `T` that nobody else uses, or
(c) flattening marketing typography into the terminal scale, which would
visually break the public site.

## Decision

**The institutional design system applies to the in-app terminal surface
only.** ESLint's design-system guardrails are scoped out of the marketing
site via `ignores` in `eslint.config.mjs`:

- `src/app/page.tsx` (marketing landing)
- `src/app/about/**`, `src/app/contact/**`, `src/app/security/**`,
  `src/app/privacy/**`, `src/app/terms/**`
- `src/app/solutions/**`, `src/app/products/**`
- `src/components/marketing/**`

The marketing site continues to use `@/components/marketing/theme` (`C`,
`F`) as its canonical token source. Hex literals and sub-12px `fontSize`
inside marketing pages are not violations.

ADR-0017 remains in force for every other path. Institutional terminal
pages — `position-desk`, `cash-positions`, `audit-lab`, `hedge-effectiveness`,
`portfolio-risk`, dashboards, modals, widgets, etc. — must use `T` and the
canonical CSS variables, and must respect the 12px floor.

## Consequences

- **Positive:** Marketing micro-typography (10px overlines, etc.) is
  legitimate and no longer flagged. Contributors editing marketing pages
  don't need to learn the terminal token surface. The remaining 1580
  `no-restricted-syntax` warnings are all in real institutional code that
  needs migration.
- **Negative:** Two design systems coexist in the codebase. New
  contributors must understand which surface they're editing. Mitigation:
  `MarketingLayout` is the visual signal — if a page wraps in it, marketing
  rules apply.
- **Neutral:** A future migration that unifies marketing and terminal tokens
  would require revisiting both this ADR and `@/components/marketing/theme`.

## References

- ADR-0017: Design Token Namespace Canonicalization
- `frontend/eslint.config.mjs` — design-system ignore list
- `frontend/src/components/marketing/theme.ts` — marketing token source
- `frontend/src/lib/design/tokens.ts` — institutional token source
