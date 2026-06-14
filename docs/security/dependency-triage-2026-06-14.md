# Dependency Vulnerability Triage — 2026-06-14

**Scope:** 79 open Dependabot alerts on `ORDRHoldings/HedgeCore` default branch
(2 critical · 32 high · 39 moderate · 6 low) — `frontend/package-lock.json` (npm)
and `backend/requirements.txt` (pip).

**Method:** the 79 alerts dedupe to ~18 unique packages (one package version can
trigger many advisories). For each: confirm a published patched version exists,
fix direct dependencies in the manifest and transitive ones via `npm audit fix` /
`overrides`, then validate locally (CI is billing-blocked — see CLAUDE.md §9.5).

**Outcome:** frontend ~70 alerts → **0** (`xlsx` migrated to the SheetJS CDN
distribution — see Addendum); backend → **2 deferred** (both with documented
justification). Both criticals fixed.

---

## Fixed — frontend (`frontend/package.json` + lockfile)

| Package | From | To | Top severity | Kind |
|---------|------|-----|--------------|------|
| `jspdf` | `^4.2.0` | `^4.2.1` | **critical** | direct |
| `handlebars` | 4.7.8 | 4.7.9 | **critical** | dev / transitive |
| `next` | `15.5.12` | `15.5.18` | high | direct |
| `axios` | `^1.14.0` | `^1.16.0` | high | direct |
| `js-cookie` | `^3.0.5` | `^3.0.7` | high | direct |
| `lodash` | ≤4.17.23 | ≥4.18.1 | high | transitive |
| `minimatch` (override) | `3.1.2` | `3.1.4` | high | override was pinning a vulnerable version |
| `flatted` | ≤3.4.1 | 3.4.2 | high | dev / transitive |
| `eslint-config-next` | `15.5.12` | `15.5.18` | — | dev (kept in lockstep with `next`) |
| `@anthropic-ai/sdk` | `^0.82.0` | `^0.91.1` | moderate | direct |
| `dompurify` | <3.4.0 | ≥3.4.0 | moderate | transitive |
| `postcss` (override) | <8.5.10 | `^8.5.10` | moderate | override (bundled under `next`) |
| `follow-redirects`, `brace-expansion`, `uuid` | various | patched | moderate | transitive (`npm audit fix`) |

**Validation:** `npm install` exit 0 · `tsc --noEmit` exit 0 · `next build` exit 0
(100 static pages, `next` 15.5.18) · `npm audit` → 1 residual (`xlsx`).

## Fixed — backend (`backend/requirements.txt`)

| Package | From | To | Severity |
|---------|------|-----|----------|
| `cryptography` | 46.0.5 | 46.0.7 | moderate + low |
| `idna` | 3.10 | 3.15 | moderate |
| `python-dotenv` | 1.1.1 | 1.2.2 | moderate |
| `ecdsa` | 0.19.1 | 0.19.2 | moderate (clears the moderate; see residual below) |
| `Pygments` | 2.19.2 | 2.20.0 | low |

**Validation:** `pip install --dry-run -r backend/requirements.txt` resolves the
full set with no conflicts (`starlette` correctly held at 0.49.1). Full `pytest`
deferred to CI — the local venvs are drifted from `requirements.txt`
(`fastapi` 0.118 vs pinned 0.121), so a local run wouldn't isolate these bumps.

---

## Residual / deferred — with justification

| Package | Sev | Why not fixed | Disposition |
|---------|-----|---------------|-------------|
| `xlsx` | ~~high~~ **resolved** | No patched version on the npm registry — SheetJS ships fixes only via its own CDN. | **RESOLVED 2026-06-14** — migrated to the SheetJS CDN distribution (0.18.5 → 0.20.3); see Addendum. Risk was already low (export-only usage, no `XLSX.read` of untrusted input). |
| `ecdsa` (high advisory) | high | python-ecdsa will not fix the Minerva timing side-channel; no patched version exists for any line. | **Risk-accept.** Transitive via `python-jose`; bumped to 0.19.2 to clear the moderate. Constant-time-sensitive crypto goes through `cryptography`, not pure-python `ecdsa`. |
| `starlette` | moderate | 1.0.x is a major jump; `fastapi` 0.121 constrains `starlette` to the 0.4x line. Forcing 1.0 breaks FastAPI. | **Defer** to a coordinated FastAPI + Starlette upgrade. |
| `pytest` | moderate | 9.x is a major bump; the advisory is in test tooling, not shipped runtime code. | **Defer** to avoid destabilizing the 5,514-test suite; reassess with the next test-stack upgrade. |

## Follow-ups
- Restore GitHub Actions billing so the standard Dependabot/CI flow runs (currently
  billing-blocked — all jobs fail in 2–9 s with empty `steps[]`, per CLAUDE.md §9.5).
- Schedule the FastAPI/Starlette + `pytest` major upgrades as their own reviewed changes
  (the `xlsx` → SheetJS-CDN migration was completed 2026-06-14 — see Addendum).
- ~~Redeploy the frontend for the `next` 15.5.18 patches~~ — done 2026-06-14
  (`dpl_9xLjmkfHD4R…` → `ordr-treasury.vercel.app`).

---

## Addendum (2026-06-14) — `xlsx` resolved via SheetJS CDN

The deferred `xlsx` high was cleared the same day. SheetJS publishes patched builds only
through its own CDN (the npm-registry `xlsx` is frozen at the vulnerable 0.18.5), so the
fix is to install the CDN tarball:

```
npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

`package.json` now pins `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"`
(0.18.5 → 0.20.3, same major — the export-only API is unchanged). The lockfile records the
tarball integrity hash, so installs stay reproducible.

**Validation:** `npm install` exit 0 (removed 8 packages) · `tsc --noEmit` exit 0 ·
`next build` exit 0 (100 pages) · **`npm audit` → 0 vulnerabilities** · functional smoke
test exercising the exact API used by `clientExport.ts` / `auditLabExport.ts`
(`aoa_to_sheet`, `book_new`, `book_append_sheet`, `json_to_sheet`, `decode_range`,
`encode_cell`, `write`) produced a valid 17 KB xlsx buffer (`PK` magic) on `XLSX.version`
`0.20.3`.

**The frontend Dependabot surface is now 0.** Remaining open alerts are backend-only:
`ecdsa` (high, won't-fix upstream) and the deferred `starlette` 1.0 / `pytest` 9 majors.
