# ADR-0019: fontSize Floor Relaxation — 12px → 10px for Institutional Mono

- **Status:** accepted
- **Date:** 2026-04-25
- **Deciders:** Frontend / Design system
- **Refines:** ADR-0017
- **Related:** ADR-0018 (marketing carve-out)

## Context

ADR-0017 set a 12px floor on inline `fontSize` literals as the institutional
minimum, intending to prevent illegible micro-typography in the terminal UI.

After the marketing carve-out (ADR-0018), the rule still flagged 1200
fontSize violations across institutional pages, distributed:

| value     | violations |
|-----------|-----------:|
| ≤ 9 px    |        150 |
| 10 px     |        477 |
| 11 px     |        573 |

A spot check across `ReportsContainer`, `portfolio-risk`, `polisophic`,
`hedge-effectiveness`, and the dashboard widgets shows that **10–11px IBM
Plex Mono** is the standard size for institutional micro-typography:

- Column headers in dense tables (TradeTable, HedgeTable, BucketCoverage)
- Overlines / section indices ("WHAT THIS MEANS", "01", scope badges)
- Status pills, key-value monoline labels, run-id chips
- Render-timestamp footers and audit IDs

This matches the conventions of the institutional terminals that ORDR
benchmarks against (Bloomberg Terminal column headers ≈ 10–11px Mono;
Refinitiv Workspace tab labels ≈ 10px; FactSet fixed-width grids ≈ 11px).
Forcing all of these to 12px would visually balloon dense data displays
that are explicitly designed for high information density.

The original 12px floor was overcalibrated against body text. Body text
should still target 14px+. But mono micro-labels at 10–11px are not a
defect; they are the design.

## Decision

The institutional `fontSize` floor is **10px** (0.625rem), not 12px.

The ESLint rule in `eslint.config.mjs` is updated:

- Numeric `fontSize` literals below 10 are flagged.
- Rem `fontSize` literals below 0.625rem are flagged.
- 10px–11px is acceptable for mono micro-typography (column headers,
  overlines, status pills, audit IDs). Body text and reading copy should
  still prefer 14px+ via `T.text*` tokens.

## Consequences

- **Positive:** 1050 false-positive warnings cleared (10–11px violations).
  Real micro-typography is no longer flagged. Genuinely unreadable text
  (≤9px) remains caught by the rule.
- **Negative:** The rule no longer enforces the upper bound for body text.
  Mitigation: 12+ is still the right default for paragraphs and form
  inputs; reviewers should flag obvious body text at 10–11px during PR
  review. The token system (`T.fontSizeBody`, `T.fontSizeMicro`) can be
  extended later if a stricter rule is wanted.
- **Neutral:** This refines the spirit of ADR-0017 without superseding it.
  The hex-literal ban and tokens-first principle stand unchanged.

## References

- ADR-0017: Design Token Namespace Canonicalization
- ADR-0018: Design System Scope — Marketing vs Terminal
- `frontend/eslint.config.mjs` — fontSize selectors
- `frontend/src/lib/design/tokens.ts` — canonical token surface
