# Current Sprint

Sprint: Sprint 56-61 — Treasury Suite Phase 1 (GL Journals, Settlement, ERP Pull)
Status: COMPLETE
Started: 2026-04-13
Completed: 2026-04-13
Browser Verified: NO — [PENDING BROWSER CONFIRMATION]

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 56.1 | ADR-0009 (GL posting) + ADR-0013 (treasury transaction) | DONE | high |
| 56.2 | JournalEntry + GLAccountMapping models with WORM + hash chain | DONE | high |
| 56.3 | TreasuryTransaction strict-WORM audit spine | DONE | high |
| 56.4 | Migrations 0014/0015/0016 — journal_entries, treasury_transactions, settlement_events | DONE | high |
| 56.5 | GL service — chain extension + generate_journal_entries + 4-eyes SoD | DONE | high |
| 56.6 | v1_gl routes — generate/approve/reject/post/export + GL mapping CRUD | DONE | high |
| 56.7 | Posting adapters — QB/Xero/NetSuite/CSV + gl_posting_service | DONE | high |
| 56.8 | ERP pull adapters — Xero/NetSuite + erp_connector_service + v1_erp routes | DONE | high |
| 56.9 | SettlementEvent WORM model + settlement_service + v1_settlement routes | DONE | high |
| 56.10 | Frontend: glClient.ts type-safe API client | DONE | medium |
| 56.11 | Frontend: /settings/gl-accounts page | DONE | medium |
| 56.12 | Frontend: /gl-postings page (approve/reject/post queue) | DONE | medium |
| 56.13 | Frontend: /settlement + /erp-sync pages | DONE | medium |
| 56.14 | Frontend: AppSidebar nav items (GL Postings, Settlement, ERP Sync) | DONE | medium |

## Completed: 14/14
## Sprint Status: COMPLETE

## Test Evidence (2026-04-13)
- Backend: 4839 passed, 158 skipped (PG-only), 0 failed
- Frontend: `tsc --noEmit` CLEAN, `next build` PASS
- Pre-existing flake: test_trace_bundle_fingerprint_deterministic (test ordering issue, passes in isolation)

## Notes
- WORM enforcement: `before_delete` SQLAlchemy event hooks + PostgreSQL triggers (no DELETE allowed)
- Hash chain: SHA-256 per-tenant, `chain_seq` monotonic, row-level lock via `FOR UPDATE` prevents races
- 4-eyes SoD: `checker.id != je.created_by` checked BEFORE state machine transition
- ERP dedup: `Position.record_id = f"ERP-{hash[:16]}"` + `is_active=True` filter (allows reimport after soft-delete)
- Settlement: confirms against LedgerEntry, creates DRAFT JournalEntry for P&L variance if GL mapping exists
- Tenant isolation: all service functions check `company_id` match before mutating

---

# Previous Sprint

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 55.1 | OverviewTab: Portfolio assessment latency card — avg and median days since last run across all assessed datasets, plus unassessed count; color-coded green≤7d / amber≤30d / red>30d | DONE | high |
| 55.2 | RunsTab: Dataset coverage count in footer bar — "DATASETS N" KPI showing how many distinct datasets appear in the filtered run list; hidden when ≤1 unique dataset | DONE | medium |
| 55.3 | DatasetsTab: "LAST FAIL" quick filter chip — red-styled button showing only datasets whose most recent run was ineffective; hidden when no such datasets exist | DONE | medium |

## Completed: 3/3
## Sprint Status: COMPLETE

## Browser Verification Evidence (2026-04-13)
- 55.1: PORTFOLIO ASSESSMENT LATENCY card rendered — AVG=1d (green), MEDIAN=1d (green), UNASSESSED=1 (amber). All thresholds + guard working.
- 55.2: Footer bar present (ALL 2 RUNS, EFFECTIVE 2/2, PASS RATE 100%, AVG D.O. 0.9917). DATASETS KPI correctly hidden: both runs share same dataset_id → set.size=1 triggers ≤1 guard.
- 55.3: LAST FAIL button correctly absent: all datasets have effective most-recent runs → 0 qualifying datasets → visibility guard hides chip.

## Notes
- 55.1: `daysSinceArr` excludes unassessed datasets. Median via sorted array, odd/even length handling. AVG/MEDIAN KPIs + optional UNASSESSED column when >0. Color thresholds: ≤7d green, ≤30d amber, >30d red.
- 55.2: `new Set(filteredRuns.map(r => r.dataset_id)).size`. Guard: `≤1` → null (not interesting when all same dataset). `datasets` not in RunsTab scope so no total shown — just count.
- 55.3: `dsLastFailOnly` state. Filter logic: finds last run by created_at, returns false if `overall_effective !== false`. Button visibility guard checks at least one dataset qualifies. Fix: initial tsc error from `datasets` in RunsTab scope — removed `/ datasets.length` suffix.
- tsc clean (exit code 0). HTTP 200 confirmed.

---

# Sprint: Sprint 54 — Standard Coverage Gap Card, Copy Run IDs & Dataset Risk Level Tag
Status: COMPLETE [NOT BROWSER CONFIRMED]
Started: 2026-04-13
Completed: 2026-04-13
Browser Verified: NO — browser automation unavailable this session

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 54.1 | OverviewTab: Standard coverage gap card — 3-column grid showing tested vs untested dataset counts per standard (IAS 39 / IFRS 9 / ASC 815) with mini progress bar and "N untested / full coverage" label | DONE [NOT BROWSER CONFIRMED] | high |
| 54.2 | RunsTab: "COPY IDS" toolbar button — copies all filtered run UUIDs (newline-separated) to clipboard; 1.5s green "COPIED!" flash; hidden when filteredRuns is empty | DONE [NOT BROWSER CONFIRMED] | medium |
| 54.3 | DatasetsTab: Per-dataset risk level tag — cycling badge (HIGH→MEDIUM→LOW→clear) stored in localStorage `hec_ds_risk`; shown in accordion header name row with color coding; faint dashed "RISK" placeholder when unset; click stops propagation so accordion doesn't toggle | DONE [NOT BROWSER CONFIRMED] | medium |

## Completed: 3/3
## Sprint Status: COMPLETE [NOT BROWSER CONFIRMED]

## Notes
- 54.1: For each standard, `datasets.filter(ds => runs.some(r => r.dataset_id===ds.id && r.standard===key)).length`. Progress bar + "N untested" suffix. Color: green=100%, amber>=50%, red otherwise.
- 54.2: `copyIdsFlash` state with `setTimeout(1500)`. `navigator.clipboard.writeText(ids).catch(()=>{})`. Button always renders when filteredRuns>0.
- 54.3: `cycleRisk(id)`: null→"HIGH"→"MEDIUM"→"LOW"→null. Stored in `hec_ds_risk`. Dashed "RISK" placeholder triggers first cycle. Click handlers use `e.stopPropagation()` to avoid accordion toggle.
- tsc clean (exit code 0). HTTP 200 confirmed.

---

# Sprint: Sprint 53 — Pass Rate Trend Card, Verdict Ratio Bar & Untested Gap Filter
Status: COMPLETE [NOT BROWSER CONFIRMED]
Started: 2026-04-13
Completed: 2026-04-13
Browser Verified: NO — browser automation unavailable this session

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 53.1 | OverviewTab: Pass rate trend indicator — compares oldest-half vs newest-half pass rates; shows IMPROVING ↗ / DECLINING ↘ / STABLE → with pp delta and per-half breakdown; guard: ≥4 dated runs | DONE [NOT BROWSER CONFIRMED] | high |
| 53.2 | RunsTab: Verdict ratio visual bar — thin 8px horizontal bar above the monthly heatmap, green segment for PASS count and red for FAIL; labels below; updates live with filters | DONE [NOT BROWSER CONFIRMED] | medium |
| 53.3 | DatasetsTab: "UNTESTED" gap filter button — red-styled chip in toolbar showing only datasets with 0 runs; button hidden when all datasets have at least one run | DONE [NOT BROWSER CONFIRMED] | medium |

## Completed: 3/3
## Sprint Status: COMPLETE [NOT BROWSER CONFIRMED]

## Notes
- 53.1: `dated.sort(oldest→newest)`. `half = floor(len/2)`. olderRate/newerRate derived from each half. THRESHOLD=0.05 (5pp). Delta shown as "+N pp" or "−N pp". Trend icon ↗/↘/→.
- 53.2: `passPct/failPct` from `filteredRuns`. Proportional flex-width segments. Color: green≥80%, amber≥50%, red otherwise. Label row below with counts.
- 53.3: `dsUntestedOnly` state. Button only renders when `datasets.some(ds => !runs.some(r => r.dataset_id === ds.id))`. Filter: `if (dsUntestedOnly && runs.some(r => r.dataset_id === ds.id)) return false`.
- tsc clean (exit code 0). HTTP 200 confirmed.

---

# Sprint: Sprint 52 — Worst Performer Card, Footer Standard Breakdown & Datasets CSV Export
Status: COMPLETE [NOT BROWSER CONFIRMED]
Started: 2026-04-13
Completed: 2026-04-13
Browser Verified: NO — browser automation unavailable this session

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 52.1 | OverviewTab: Worst performer card — red mirror of 49.1 top performer; shows dataset with lowest composite score (passRate×0.7 + D.O.proximity×0.3); guard: requires ≥2 datasets with runs | DONE [NOT BROWSER CONFIRMED] | high |
| 52.2 | RunsTab: Per-standard breakdown pills in footer — after the KPI stats, clickable "IAS 39 N / IFRS 9 N / ASC 815 N" buttons that set stdFilter on click (toggle off if already active); only shown when ≥2 standards have runs | DONE [NOT BROWSER CONFIRMED] | medium |
| 52.3 | DatasetsTab: Export CSV button — "CSV" button in toolbar exports filtered datasets as CSV with columns: name, currency_pair, hedge_type, period_count, runs, pass_rate_pct, last_assessed | DONE [NOT BROWSER CONFIRMED] | medium |

## Completed: 3/3
## Sprint Status: COMPLETE [NOT BROWSER CONFIRMED]

## Notes
- 52.1: Same scoring as 49.1. Sorted ascending and takes [0]. Guard: `rows.length < 2` to avoid showing worst when only 1 dataset has runs. Red styling (HEX.redBg/redBorder). Shows fail rate (1-passRate).
- 52.2: `stdCounts` = STDS.map → filter count>0. Guard: `stdCounts.length < 2` → null. Toggle: `setStdFilter(stdFilter === std ? "ALL" : std)`. Divider added before the pills.
- 52.3: `URL.createObjectURL` pattern. CSV headers: name/pair/hedge_type/period_count/runs/pass_rate/last_assessed. Quotes name field with escaped double-quotes. Uses `filteredDs` so export respects current search+filter state.
- tsc clean (exit code 0). HTTP 200 confirmed.

---

# Sprint: Sprint 51 — YTD Summary Card, R²-Only Filter & Run Mini-Timeline
Status: COMPLETE [NOT BROWSER CONFIRMED]
Started: 2026-04-13
Completed: 2026-04-13
Browser Verified: NO — browser automation unavailable this session

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 51.1 | OverviewTab: Year-to-date summary card — 3-column grid showing YTD RUNS / PASS RATE / AVG D.O. with prior-year comparison row and up/down arrow delta | DONE [NOT BROWSER CONFIRMED] | high |
| 51.2 | RunsTab: R²-only filter toggle — "R² DATA" button that filters runs to only those with `regression_r_squared != null`; active pill appears in the active-filters bar; resets on page change | DONE [NOT BROWSER CONFIRMED] | medium |
| 51.3 | DatasetsTab: Recent runs mini-timeline — thin row of coloured squares (green=PASS, red=FAIL) at top of expanded accordion, oldest-left newest-right, max 20 cells, hover tooltip with date + verdict + standard | DONE [NOT BROWSER CONFIRMED] | medium |

## Completed: 3/3
## Sprint Status: COMPLETE [NOT BROWSER CONFIRMED]

## Notes
- 51.1: `thisYear`/`priorYear` computed from `new Date()`. KPIS array with fmt functions. Delta arrow only shown when non-zero. Guard: returns null if both year buckets empty.
- 51.2: `showR2Only` state added next to `showStarredOnly`. `.filter((r) => !showR2Only || r.regression_r_squared != null)` appended to `filteredRuns`. Reset useEffect dep array updated. Active-filter pill: "R² DATA ONLY".
- 51.3: `allDsRuns` sorted oldest→newest (reversed from existing `dsRuns`). MAX_CELLS=20. Cells: 10×14px rounded squares. Tooltip: `date · PASS/FAIL · STANDARD`. Count suffix shows "last 20 shown" when >20 total.
- tsc clean (exit code 0). HTTP 200 confirmed.

---

# Sprint: Sprint 50 — Assessment Calendar Heatmap, Out-of-Band Warning Badge & Compliance Sort
Status: COMPLETE [NOT BROWSER CONFIRMED]
Started: 2026-04-13
Completed: 2026-04-13
Browser Verified: NO — browser automation unavailable this session

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 50.1 | OverviewTab: Assessment calendar heatmap — 12-week rolling grid (week columns × day-of-week rows) showing assessment days by colour intensity; green=all pass, amber=mixed, red=all fail; darker=more runs; legend row below | DONE [NOT BROWSER CONFIRMED] | high |
| 50.2 | RunsTab: Out-of-band warning badge — amber "⚠ OOB" badge before the efficiency score when a run is overall_effective but D.O. ratio is outside the 80–125% band (ratio < 0.80 or > 1.25) | DONE [NOT BROWSER CONFIRMED] | medium |
| 50.3 | DatasetsTab: Compliance sort — new "Compliance score" option in sort dropdown; score = passRate×0.5 + recency×0.3 + sufficiency×0.2; highest compliance datasets float to top | DONE [NOT BROWSER CONFIRMED] | medium |

## Completed: 3/3
## Sprint Status: COMPLETE [NOT BROWSER CONFIRMED]

## Notes
- 50.1: 12-week grid built with `gridColumn`/`gridRow` explicit placement (column-major ordering in array, row-major CSS grid). `cellColor` uses opacity = 0.25 + (count/maxCount)*0.65. Month labels row above, DOW labels left of grid. Legend row: No runs / All pass / Mixed / All fail + "Darker = more runs". tsc clean.
- 50.2: Guard: `r.overall_effective && r.dollar_offset_ratio != null`. IIFE renders null if in-band. OOB title tooltip with exact value. Shows before efficiency score badge.
- 50.3: `compScore(ds)` = passRate*0.5 + recency*0.3 + sufficiency*0.2. recency = 1 if assessed<7d, 0.5 if <30d, 0 otherwise. sufficiency = Math.min(runCount/5, 1). Highest score = most compliant first.
- tsc clean (exit code 0). HTTP 200 confirmed.

---

# Sprint: Sprint 49 — Top Performer Card, Selection Summary Bar & Duplicate Pair Badge
Status: COMPLETE [NOT BROWSER CONFIRMED]
Started: 2026-04-13
Completed: 2026-04-13
Browser Verified: NO — browser automation unavailable this session

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 49.1 | OverviewTab: Top performer highlight card — green card showing the highest-scoring dataset (70% pass rate + 30% D.O. proximity to 1.0); shows name, pair, pass%, avg D.O., run count | DONE [NOT BROWSER CONFIRMED] | high |
| 49.2 | RunsTab: Selection summary bar — blue info bar appearing when ≥1 run is checked showing SELECTION(N) · effective/total · pass% · avg D.O. for the selection | DONE [NOT BROWSER CONFIRMED] | medium |
| 49.3 | DatasetsTab: Duplicate currency pair badge — amber "⊕ N DATASETS" badge on the dataset name row when 2+ datasets share the same currency pair | DONE [NOT BROWSER CONFIRMED] | medium |

## Completed: 3/3
## Sprint Status: COMPLETE [NOT BROWSER CONFIRMED]

## Notes
- 49.1: `typeof datasets[0]` type alias for local typed rows. Score = passRate*0.7 + (1-|avgDo-1.0|/0.25)*0.3. Top = highest score. Test: EUR/USD Q1 2024 Test: 100% pass, avgDo=0.9917 → score≈0.990. Copy dataset: no runs → excluded. Top performer = EUR/USD Q1 2024 Test.
- 49.2: Inserted above filter pill bar. `sel = runs.filter(r => selectedIds.has(r.run_id))`. SELECTION badge + effective count + pass% + avgDo. Only shown when selectedIds.size >= 1. Test: select 1 run → "SELECTION (1) · 1/1 EFFECTIVE · 100% PASS · AVG D.O. 0.9917".
- 49.3: `dupeCount = datasets.filter(d => d.id !== ds.id && d.currency_pair === ds.currency_pair).length`. Guard: dupeCount===0→null. Test: both datasets have EUR/USD pair → each shows "⊕ 2 DATASETS" amber badge.
- tsc clean (exit code 0). HTTP 200 confirmed.

---

# Sprint: Sprint 48 — D.O. Distribution Histogram, Run Age Stats & Total Periods
Status: COMPLETE [NOT BROWSER CONFIRMED]
Started: 2026-04-13
Completed: 2026-04-13
Browser Verified: NO — browser automation unavailable this session

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 48.1 | OverviewTab: D.O. ratio distribution histogram — 5 bands (<0.80 / 0.80–0.94 / 0.95–1.05 / 1.05–1.25 / >1.25), proportional bar heights, count labels, color-coded red/amber/green | DONE [NOT BROWSER CONFIRMED] | high |
| 48.2 | RunsTab: Run age stats in footer bar — NEWEST "Xd ago" / TODAY and SPAN "Xd" KPIs appended to existing stats bar; suppressed when no dated runs | DONE [NOT BROWSER CONFIRMED] | medium |
| 48.3 | DatasetsTab: Total periods aggregate — "N PERIODS" count in the toolbar, summing period_count across all visible (filtered) datasets | DONE [NOT BROWSER CONFIRMED] | medium |

## Completed: 3/3
## Sprint Status: COMPLETE [NOT BROWSER CONFIRMED]

## Notes
- 48.1: BANDS as const tuple with min/max/color. `counts[i]` per band. Bar height proportional to maxCount (min 8px). Empty band shows grey stub. Test: both runs D.O.=0.9917 → band "0.95–1.05" count=2, others=0.
- 48.2: `ageStats` computed from `datedRuns.map(r => new Date(...).getTime())`. NEWEST = `Date.now() - max(dates)` / 86400000. SPAN = `(max - min) / 86400000` (hidden when 0). Test: runs from 4/12 → NEWEST "1D AGO", SPAN 0 (hidden).
- 48.3: `totalPeriods = filteredDs.reduce((sum, ds) => sum + ds.period_count, 0)`. Suppressed when 0. Test: 2 datasets × 6 periods = 12 PERIODS.
- tsc clean (exit code 0). HTTP 200 confirmed.

---

# Sprint: Sprint 47 — Month-over-Month Card, Page-Jump Input & Standards Compliance Badge
Status: COMPLETE [NOT BROWSER CONFIRMED]
Started: 2026-04-13
Completed: 2026-04-13
Browser Verified: NO — browser automation unavailable this session

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 47.1 | OverviewTab: Month-over-month comparison card — THIS MONTH vs LAST MONTH run count + pass count, ↑/↓/= delta badge; 3-column grid layout | DONE [NOT BROWSER CONFIRMED] | high |
| 47.2 | RunsTab: Page-jump input — "GO [___]" number input appended to pagination bar; only renders when totalPages > 5; Enter key commits jump clamped to [1, totalPages] | DONE [NOT BROWSER CONFIRMED] | medium |
| 47.3 | DatasetsTab: Standards compliance badge — "N/3 STD" badge showing how many of the 3 standards (IAS 39, IFRS 9, ASC 815) have been tested for each dataset; green when 3/3, purple otherwise | DONE [NOT BROWSER CONFIRMED] | medium |

## Completed: 3/3
## Sprint Status: COMPLETE [NOT BROWSER CONFIRMED]

## Notes
- 47.1: `new Date(thisYear, thisMonth-1, 1)` handles Jan→Dec wrap via JS Date normalisation. 3-column grid: [LAST_MONTH_count] [delta_badge] [THIS_MONTH_count]. Test: both runs from April → APR: 2 runs, 2 pass; MAR: 0 runs. Delta = +2 (↑ green).
- 47.2: Guard `totalPages > 5` → hidden in test data (only 2 runs). Input with `key={safePage}` resets to current page when user navigates. `parseInt` + clamp on Enter. `e.stopPropagation()` prevents keyboard nav handler.
- 47.3: `testedCount = STDS.filter(std => dsRuns.some(r => r.standard === std)).length`. Guard: testedCount===0→null. "2/3 STD" purple, "3/3 STD" green. Test: EUR/USD Q1 2024 Test has IFRS_9 + ASC_815 runs → "2/3 STD" purple badge.
- tsc clean (exit code 0). HTTP 200 confirmed.

---

# Sprint: Sprint 46 — Needs Attention Panel, R² Quality Badge & Relative Age Chip
Status: COMPLETE [NOT BROWSER CONFIRMED]
Started: 2026-04-13
Completed: 2026-04-13
Browser Verified: NO — all browser automation backends unavailable (Playwright closed, Chrome DevTools profile locked, claude-in-chrome extension disconnected)

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 46.1 | OverviewTab: Datasets needing attention panel — lists datasets with no runs, last run ineffective, or last run > 14d ago; shows green "ALL DATASETS CURRENT" when none at risk | DONE [NOT BROWSER CONFIRMED] | high |
| 46.2 | RunsTab: R² quality badge — STRONG (≥0.80) / MOD (≥0.60) / WEAK (<0.60) badge rendered below the R² value in the R² column cell; suppressed when r² is null | DONE [NOT BROWSER CONFIRMED] | medium |
| 46.3 | DatasetsTab: Relative age chip — "TODAY" / "Nd AGO" / "NMO AGO" / "NYR AGO" line rendered below the absolute created_at date in the CREATED column | DONE [NOT BROWSER CONFIRMED] | medium |

## Completed: 3/3
## Sprint Status: COMPLETE [NOT BROWSER CONFIRMED]

## Notes
- 46.1: `atRisk = datasets.filter(ds => noRuns || daysSince>14 || lastIneffective)`. Green banner when atRisk.length===0. Red-bordered card listing each at-risk dataset with reason. Test: EUR/USD Q1 2024 Test (Copy) has no runs → appears in list. EUR/USD Q1 2024 Test has runs from 4/12 → daysSince≈1, effective → not at risk.
- 46.2: Wraps existing R² span in a flex column. IIFE computes label+colors from threshold. suppressed when r.regression_r_squared===null (test data: all null → badges suppressed, existing "—" unchanged).
- 46.3: IIFE inside the created_at span. `days=floor((now-created)/86400000)`. Labels: 0→TODAY (green), 1→"1D AGO", <30→"Nd AGO", <365→"NMO AGO", else "NYR AGO".
- tsc clean (exit code 0). HTTP 200 confirmed.

---

# Sprint: Sprint 45 — Standard Coverage Matrix, Copy Run ID & Hedge-Type Filter
Status: COMPLETE ✓ BROWSER CONFIRMED
Started: 2026-04-13
Completed: 2026-04-13
Browser Verified: 2026-04-13

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 45.1 | OverviewTab: Standard coverage matrix — grid of datasets × standards (IAS 39 / IFRS 9 / ASC 815) showing PASS/FAIL/— per cell; highlights untested standard-dataset combinations | DONE ✓ BROWSER CONFIRMED | high |
| 45.2 | RunsTab: Copy run ID button — clipboard icon next to truncated hash; `navigator.clipboard.writeText(r.run_id)` on click; hover turns cyan | DONE ✓ BROWSER CONFIRMED | medium |
| 45.3 | DatasetsTab: Hedge-type filter chips — TYPE: ALL / CASH FLOW / FAIR VALUE / etc. chips above column headers; suppressed when < 2 distinct types present | DONE ✓ BROWSER CONFIRMED | medium |

## Completed: 3/3
## Sprint Status: COMPLETE ✓ BROWSER CONFIRMED

## Notes
- 45.1: `matrix = datasets.map(ds => { coverage: STDS.map(std => { tested, passed }) })`. Passed = all runs for that std are effective AND at least 1 run exists. Cell: PASS (green) / FAIL (red) / — (grey). Dataset name truncated to 20 chars. Test: EUR/USD Q1 2024 Test → IFRS_9 PASS, ASC_815 PASS, IAS_39 —. Copy dataset → all —.
- 45.2: Small SVG clipboard icon (10×10). `e.stopPropagation()` prevents row click. `navigator.clipboard.writeText(r.run_id).catch(() => {})` silent fail. Confirmed visible in screenshot sprint45-runs-copy-btn.png.
- 45.3: `dsHedgeFilter: string | null` state. Filter applied in `filteredDs` computation. `[null, ...types]` pattern for ALL chip. Guard: `types.length < 2 → null`. Test data: both CASH_FLOW → chips suppressed (correct). Would show with mixed hedge types.
- tsc clean (exit code 0)

---

# Sprint: Sprint 44 — Pass Streak Card, Run Sequence Badge & Expand-All Toggle
Status: COMPLETE ✓ BROWSER CONFIRMED
Started: 2026-04-13
Completed: 2026-04-13
Browser Verified: 2026-04-13

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 44.1 | OverviewTab: Current pass streak card — streak count (trailing effective runs from most recent), progress bar, PERFECT/BROKEN/% badge; shows "All N runs effective — perfect record" when unbroken | DONE ✓ BROWSER CONFIRMED | high |
| 44.2 | RunsTab: Run sequence badge "RUN N/M" showing chronological position within dataset — built from dsSeqMap alongside dsFirstRunMap in flat-rows IIFE | DONE ✓ BROWSER CONFIRMED | medium |
| 44.3 | DatasetsTab: Expand-all / collapse-all toggle button — `expandAll` boolean state; clicking a row header resets expandAll and restores per-item control | DONE ✓ BROWSER CONFIRMED | medium |

## Completed: 3/3
## Sprint Status: COMPLETE ✓ BROWSER CONFIRMED

## Notes
- 44.1: Sort all runs by created_at desc; walk until first ineffective → streak count. Color green=perfect, amber=partial, red=broken. Test: 2/2 effective → streak=2, label "perfect record", badge PERFECT. Confirmed.
- 44.2: `dsSeqMap[run_id] = { seq: i+1, total: N }` built by sorting each dataset's runs by created_at asc. Badge: S.sub bg, S.text3 color, "RUN 2/2" / "RUN 1/2". Confirmed both runs show correct sequence.
- 44.3: `expandAll` state in DatasetsTab. Toggle button shows "⊞ EXPAND ALL" / "⊟ COLLAPSE ALL". All 3 expanded checks updated to `expandAll || expandedId === ds.id`. Row click resets expandAll. Both accordions expanded on click. Screenshot: sprint44-datasets-expanded-all.png.
- tsc clean (exit code 0)

---

# Sprint: Sprint 43 — Hedge Type Distribution, First Run Badge & Description Preview
Status: COMPLETE ✓ BROWSER CONFIRMED
Started: 2026-04-13
Completed: 2026-04-13
Browser Verified: 2026-04-13

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 43.1 | OverviewTab: Hedge type distribution card — per-hedge-type progress bars showing run count + effectiveness rate; inserted before regression test coverage card | DONE ✓ BROWSER CONFIRMED | high |
| 43.2 | RunsTab: First run badge — purple "1ST" badge on the chronologically earliest run per dataset (dsFirstRunMap keyed by dataset_id); suppressed for all subsequent runs | DONE ✓ BROWSER CONFIRMED | medium |
| 43.3 | DatasetsTab: Description preview in accordion header — italic, text-overflow:ellipsis line below the badges row; only renders when ds.description is non-null | DONE ✓ BROWSER CONFIRMED | medium |

## Completed: 3/3
## Sprint Status: COMPLETE ✓ BROWSER CONFIRMED

## Notes
- 43.1: `dsHedgeType` map from datasets. `typeGroups` = reduce runs into {total, effective} keyed by hedge_type. Progress bar width = effective/total*100%. Guard: totalRuns >= 1. "BY HEDGE TYPE" header. Test: cash flow · 2 runs · 100% confirmed visible.
- 43.2: `dsFirstRunMap` built in flat-rows IIFE alongside `dsRankMap`. Earliest run per dataset by `created_at` string compare. Badge: purple #A78BFA, 9px mono, "1ST". Test: ASC_815 run (earlier created_at) shows 1ST badge. Screenshot: sprint43-runs-tab.png
- 43.3: `{ds.description && <div ...>{ds.description}</div>}`. Font: S.ui 11px italic, S.text3. maxWidth 420px ellipsis. Guard: non-null description only. Test data: description=null → correctly suppressed. Screenshot: sprint43-datasets-tab.png
- tsc clean (exit code 0). S.fontUI/S.fontMono typos fixed to S.ui/S.mono.

---

# Sprint: Sprint 42 — Audit Readiness Score, D.O. Delta Badge & Designation Age
Status: COMPLETE ✓ BROWSER CONFIRMED
Started: 2026-04-13
Completed: 2026-04-13
Browser Verified: 2026-04-13

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 42.1 | OverviewTab: Audit readiness score card — composite 0–100 with letter grade (A–F); breakdown: pass rate 40pts + period sufficiency 20pts + recency 20pts + regression coverage 20pts; 4-column mini progress bars | DONE ✓ BROWSER CONFIRMED | high |
| 42.2 | RunsTab: D.O. ratio delta vs prior run on same dataset — ▲/▼ badge with 4dp delta shown inline below the D.O. ratio band bar; compares to most-recent prior run on same dataset; suppressed when no prior run or delta < 0.0001 | DONE ✓ BROWSER CONFIRMED | medium |
| 42.3 | DatasetsTab: Designation date / hedge age badge — purple "Nd HEDGE" / "NmoMO HEDGE" / "NYR HEDGE" badge from ds.designation_date; suppressed when field is null | DONE ✓ BROWSER CONFIRMED | medium |

## Completed: 3/3
## Sprint Status: COMPLETE ✓ BROWSER CONFIRMED

## Notes
- 42.1: passScore=40*(eff/total), suffScore=20*(datasets≥8periods/total), recencyScore=20*(dsWithRunLast30d/total), r2Score=20*(runsWithR2/total). Grade thresholds: A≥90, B≥75, C≥60, D≥40, F<40. 4-col grid, each col: label + score/max + 3px progress bar. Test: 50/100 (D) — PASS RATE 40/40 ✓, SUFFICIENCY 0/20 (6<8), RECENCY 10/20 (1/2 ds recent), REGRESSION 0/20 (no R²). Screenshot: sprint42-audit-readiness.png
- 42.2: `sameDs` = runs same dataset_id, has D.O., different run_id. `prior` = most-recent run where created_at < this run's created_at. Delta = ratio - prior.dollar_offset_ratio. Suppressed if |delta| < 0.0001. ▲ green (positive), ▼ red (negative). Test: each dataset has only 1 run → no prior → correctly suppressed. Screenshot: sprint42-runs-delta.png
- 42.3: `days = floor((now - designation_date) / 86400000)`. Labels: ≥365d → "NYR HEDGE", ≥30d → "NMO HEDGE", else "ND HEDGE". Purple (#A78BFA) badge. Guard: `!ds.designation_date → null`. Test data: designation_date=null → both badges suppressed (correct). Screenshot: sprint42-datasets-designation.png
- tsc clean (exit code 0)

---

# Sprint: Sprint 41 — Period Sufficiency Matrix, Filter Stats Row & Verdict Sparkline
Status: COMPLETE ✓ BROWSER CONFIRMED
Started: 2026-04-13
Completed: 2026-04-13
Browser Verified: 2026-04-13

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 41.1 | OverviewTab: Period sufficiency matrix — per-dataset row showing period count vs minimum required per standard (IAS 39 ≥8, ASC 815 ≥8, IFRS 9 ≥30); green SUFFICIENT or red NEEDS N+ badges per standard | DONE ✓ BROWSER CONFIRMED | high |
| 41.2 | RunsTab: Filter statistics summary row — "BY STD: X 1× Y%" compact row between filter pills and heatmap; only renders when ≥2 distinct standards in filteredRuns; shows count + pass rate per standard | DONE ✓ BROWSER CONFIRMED | medium |
| 41.3 | DatasetsTab: Last 5 runs verdict sparkline — row of 5 mini 8×8px colored squares (green=effective, red=ineffective), newest first, opacity fades 12% per step; tooltip on each dot; suppressed when no runs | DONE ✓ BROWSER CONFIRMED | medium |

## Completed: 3/3
## Sprint Status: COMPLETE ✓ BROWSER CONFIRMED

## Notes
- 41.1: `STANDARDS = [{IAS_39, min:8}, {ASC_815, min:8}, {IFRS_9, min:30}] as const`. Per dataset: `ok = ds.period_count >= std.min`. Green SUFFICIENT (✓) vs red `NEEDS N+` where N=min-period_count. Test data: 6 periods → IAS 39 NEEDS 2+, ASC 815 NEEDS 2+, IFRS 9 NEEDS 24+. Screenshot: sprint41-period-sufficiency.png
- 41.2: `stdKeys = Array.from(new Set(filteredRuns.map(r => r.standard))).sort()`. Guard: `stdKeys.length < 2 → null`. Color: 100%=green, ≥50%=amber, else red. Label format: "ASC 815 1× 100%". Test data: 2 standards → row visible: "BY STD: ASC 815 1× 100% IFRS 9 1× 100%". Screenshot: sprint41-runs-filterstats.png
- 41.3: `.slice(0,5)` of runs sorted newest-first for the dataset. Each dot: `width:8, height:8, borderRadius:2, opacity: 1 - i*0.12`. Title attr shows verdict + date per dot. Test: 2 green dots on EUR/USD Q1 2024 Test. Copy dataset: 0 runs → suppressed. Screenshot: sprint41-datasets-sparkline.png
- tsc clean (exit code 0)

---

# Sprint: Sprint 40 — Test Method Coverage, Date Presets & Assessment Frequency Badge
Status: COMPLETE ✓ BROWSER CONFIRMED
Started: 2026-04-13
Completed: 2026-04-13
Browser Verified: 2026-04-13

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 40.1 | OverviewTab: Test method coverage card — per-standard bar chart showing % of runs with regression (R² present) vs D.O.-only; shows only standards with ≥1 run; useful for IFRS 9 regression compliance visibility | DONE ✓ BROWSER CONFIRMED | high |
| 40.2 | RunsTab: Quick date range presets — 7D / 30D / 90D pill buttons inline after TO date input; sets dateFrom to N days ago and clears dateTo (open range); active button highlighted cyan | DONE ✓ BROWSER CONFIRMED | high |
| 40.3 | DatasetsTab: Assessment frequency badge — "X/MO" avg run rate in accordion header; only shown for datasets with ≥2 runs; falls back to "Nd CADENCE" when rate < 1/month | DONE ✓ BROWSER CONFIRMED | medium |

## Completed: 3/3
## Sprint Status: COMPLETE ✓ BROWSER CONFIRMED

## Notes
- 40.1: `STANDARDS = ["IAS_39", "IFRS_9", "ASC_815"] as const`. Guard: `stdRuns.length === 0 → null`. `withR2 = runs with r.regression_r_squared != null`. `r2Pct >= 50 → green, else amber`. Progress bar uses `width: r2Pct%` + cyan fill. Test data: 2 runs, both no R² → 0% bars (correct). Screenshot: sprint40-test-method-coverage.png
- 40.2: `from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)`. `active = dateFrom === from && dateTo === ""`. Buttons: `([7, 30, 90] as const).map(...)`. Open-ended range (no dateTo) means "from N days ago to now". Screenshot: "7D 30D 90D" visible in toolbar. Screenshot: sprint40-runs-datepresets.png
- 40.3: `monthsSpan = max(1, elapsed / 30days)`. `perMonth = dsRuns.length / monthsSpan`. Label: ≥1/mo → "X.X/MO", else "Nd CADENCE". Test data: 2 runs both from today → monthsSpan=1, perMonth=2 → "2.0/MO" cyan badge. Copy dataset: 0 runs → badge suppressed (needs ≥2). Screenshot: sprint40-datasets-frequency.png
- tsc clean (exit code 0)

---

# Sprint: Sprint 39 — D.O. Band Distribution, Efficiency Score Badge & Next Assessment Due
Status: COMPLETE ✓ BROWSER CONFIRMED
Started: 2026-04-13
Completed: 2026-04-13
Browser Verified: 2026-04-13

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 39.1 | OverviewTab: D.O. ratio band distribution bar — stacked horizontal bar showing % of runs below band (<0.80), in band (0.80–1.25), above band (>1.25); color-coded segments with count legend; only renders when ≥1 run has D.O. data | DONE ✓ BROWSER CONFIRMED | high |
| 39.2 | RunsTab: Per-run efficiency score badge — 0–100 composite (D.O. proximity to 1.0 = 70%, R² = 30%); rendered inline next to EFFECTIVE/INEFFECTIVE verdict chip; suppressed when no D.O. data | DONE ✓ BROWSER CONFIRMED | medium |
| 39.3 | DatasetsTab: Next assessment due badge — 30-day cadence; shows "DUE IN Nd" (amber, ≤7 days) or "OVERDUE Nd" (red) or "NOT SCHEDULED" (gray, no runs); suppressed when >7 days remaining | DONE ✓ BROWSER CONFIRMED | medium |

## Completed: 3/3
## Sprint Status: COMPLETE ✓ BROWSER CONFIRMED

## Notes
- 39.1: `doRuns = runs.filter(r => r.dollar_offset_ratio != null)`. Segments: below (<0.80, red), inBand (0.80–1.25, green), above (>1.25, amber). `abovePct = 100 - belowPct - inPct` to avoid rounding drift. Stacked bar via `width: ${pct}%`. Segment skipped if pct=0. Legend row with color swatch, label, badge, count. Test: 100% green (2/2 in-band). Screenshot: sprint39-doband-chart.png
- 39.2: Formula: `proximity = inBand ? max(0, 1 - |do - 1.00| / 0.25) : 0`. `score = round(proximity * 70 + r2Score * 30)`. `r2Score` defaults to 0.5 when no R² data. Color thresholds: ≥80 green, ≥55 cyan, ≥35 amber, <35 red. Tiny `fontSize:9` score number after verdict chip. Test: D.O.=0.9917 → proximity=0.97, no R²→0.5 → score=83 (green). Screenshot: sprint39-runs-efficiency.png
- 39.3: `CADENCE=30`. `daysUntil = 30 - daysSince`. Suppressed when daysUntil > 7 (plenty of time). No runs → "NOT SCHEDULED" gray badge. Test: runs from yesterday → daysSince=1, daysUntil=29 → suppressed (correct). Copy dataset (no runs) → "NOT SCHEDULED". Screenshot: sprint39-datasets-nextdue.png
- tsc clean (exit code 0)

---

# Sprint: Sprint 38 — Top Performers Panel, Page Size Selector & Health Score Badge
Status: COMPLETE ✓ BROWSER CONFIRMED
Started: 2026-04-13
Completed: 2026-04-13
Browser Verified: 2026-04-13

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 38.1 | OverviewTab: Top performing datasets panel — top 3 by pass rate (min 2 runs), rank badges #1/#2/#3, progress bars, avg D.O. per dataset; guard: hidden when no dataset has ≥2 runs | DONE ✓ BROWSER CONFIRMED | high |
| 38.2 | RunsTab: Dynamic page size selector — PER PAGE 25/50/ALL toggle buttons bottom-right; `pageSize` state (25\|50\|0); `PAGE_SIZE` derived after `filteredRuns`; resets page to 1 on change | DONE ✓ BROWSER CONFIRMED | high |
| 38.3 | DatasetsTab: Dataset health score badge — composite 0–100 score (pass rate 40pts + recency 30pts + volume 20pts + drift stability 10pts); A/B/C/D tier badges with color-coded bg/border; tooltip shows formula | DONE ✓ BROWSER CONFIRMED | medium |

## Completed: 3/3
## Sprint Status: COMPLETE ✓ BROWSER CONFIRMED

## Notes
- 38.1: `dsGroups` maps each dataset → {name, pair, passRate, total, effCount, avgDo}. Guard: `dsRuns.length < 2` → null. Sort by passRate DESC then total DESC. `.slice(0, 3)` for top 3. Rank #1/#2/#3 prefix. Renders when `dsGroups.length > 0`. Test data: no dataset has ≥2 runs → panel correctly suppressed.
- 38.2: `const [pageSize, setPageSize] = useState<25 | 50 | 0>(25)`. `PAGE_SIZE` moved after `filteredRuns` declaration to avoid "used before defined" error: `const PAGE_SIZE = pageSize === 0 ? filteredRuns.length || 1 : pageSize`. Selector: `([25, 50, 0] as const).map(sz => ...)`. Active button cyan. Screenshot: PER PAGE **25** 50 ALL visible bottom-right.
- 38.3: `dsHealth` map computed after `dsDrift`. Formula: passScore=40*(eff/total), recencyScore=30*max(0,1-days/90), countScore=min(20,total*4), driftScore=10 if |drift|<0.10 else 0. Tiers: A≥80 (green), B≥60 (cyan), C≥40 (amber), D<40 (red). `title` attr exposes formula as tooltip. Test data: "EUR/USD Q1 2024 Test" → A 88 (cyan badge). tsc clean; screenshot: sprint38-datasets-health.png

---

# Sprint: Sprint 37 — Compliance Scorecard, Summary Footer & Staleness Badge
Status: COMPLETE ✓ BROWSER CONFIRMED
Started: 2026-04-13
Completed: 2026-04-13
Browser Verified: 2026-04-13

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 37.1 | OverviewTab: Compliance scorecard table — 3-column grid (IAS 39 / IFRS 9 / ASC 815) showing COMPLIANT / NON-COMPLIANT / NOT TESTED status based on last run verdict; pass rate + run count + last assessment date per standard | DONE ✓ BROWSER CONFIRMED | high |
| 37.2 | RunsTab: Filtered-runs summary footer — sticky bar below run list showing ALL N RUNS or FILTERED N RUNS with EFFECTIVE count, PASS RATE, AVG D.O., AVG R² computed from filteredRuns array | DONE ✓ BROWSER CONFIRMED | high |
| 37.3 | DatasetsTab: Dataset staleness badge in accordion header — shows `Nd AGO` (amber, 7-29 days) or `Nd STALE` (red, ≥30 days) after the last verdict chip; suppressed when <7 days (fresh) or no runs | DONE ✓ BROWSER CONFIRMED | medium |

## Completed: 3/3
## Sprint Status: COMPLETE ✓ BROWSER CONFIRMED

## Notes
- 37.1: `STANDARDS` const-tuple with key/label/desc. `lastRun` = most-recent run for that standard. Status: no runs → "NOT TESTED" (gray); last effective → "COMPLIANT" (green); last ineffective → "NON-COMPLIANT" (red). 3-col border-right grid. Pass rate % with run count. Last date from `lastRun.created_at`. Test data: IFRS_9=COMPLIANT (1 run), ASC_815=COMPLIANT (1 run), IAS_39=NOT TESTED (0 runs).
- 37.2: `doVals` / `r2Vals` filtered for non-null. `avgDo` in-band → green, else amber. `isFiltered = filteredRuns.length < runs.length`. kpis array with spread for nullable avgDo/avgR2. Screenshot: `ALL 2 RUNS | EFFECTIVE 2/2 | PASS RATE 100% | AVG D.O. 0.9917`.
- 37.3: Inline IIFE computes last run date from `runs.filter(r.dataset_id === ds.id)`. Days < 7 → null. Days 7-29 → amber `Nd AGO`. Days ≥ 30 → red `Nd STALE`. Suppressed for never-assessed datasets. Test data: runs from today → 0 days → badge suppressed (correct).
- tsc clean; screenshot: sprint37-runs-summary-footer.png

---

# Sprint: Sprint 36 — Assessment Velocity Card, Multi-Standard Breakdown & Help Overlay
Status: COMPLETE ✓ BROWSER CONFIRMED
Started: 2026-04-13
Completed: 2026-04-13
Browser Verified: 2026-04-13

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 36.1 | OverviewTab: Assessment velocity card — LAST 7 DAYS / LAST 30 DAYS / AVG/WEEK / CADENCE (STABLE/ACCELERATING/DECELERATING based on 4-week window comparison) | DONE ✓ BROWSER CONFIRMED | high |
| 36.2 | DatasetsTab: Multi-standard breakdown table in accordion — card-grid per standard with pass rate %, effective/total, avg D.O.; guard: only renders when ≥2 distinct standards present for that dataset | DONE ✓ BROWSER CONFIRMED | medium |
| 36.3 | RunsTab: Keyboard shortcut help overlay — `?` toolbar button + `?` key toggle; bottom-right corner panel with kbd chips for ↑↓/Enter/Space/Esc/?; backdrop dismiss; separate useEffect (no conflict with existing nav handler) | DONE ✓ BROWSER CONFIRMED | medium |

## Completed: 3/3
## Sprint Status: COMPLETE ✓ BROWSER CONFIRMED

## Notes
- 36.1: `runsLast7`, `runsLast30`, `runsW1to4`, `runsW5to8` computed from `Date.now() - new Date(r.created_at)`. `weeklyRate = runsLast30 / 4`. Cadence: W1-4 > W5-8+1 → ACCELERATING, < W5-8-1 → DECELERATING, else STABLE. Renders when ≥2 runs. Test data: 2 runs today → LAST 7: 2, LAST 30: 2, AVG/WEEK: 0.5, CADENCE: STABLE.
- 36.2: `dsRuns.reduce` builds `{total, effective, ratios[]}` per standard. Guard: `stdKeys.length < 2` → returns null. Correctly suppressed for test data (1 run/dataset, 1 standard). Dynamic grid columns: `repeat(${stdKeys.length}, 1fr)`. Pass rate color-coded. Average D.O. computed from ratios array.
- 36.3: `showHelp` state + `useEffect` with `?` toggle and `Escape` dismiss (separate from existing nav effect). `?` button in toolbar between PRESETS and flex spacer. Help panel: fixed bottom-right, backdrop click dismisses. 5 shortcut rows with `<kbd>` chips. "Press ? or Esc to close" footer.
- tsc clean (exit code 0); screenshot: sprint36-runs-help-overlay.png

---

# Sprint: Sprint 35 — Currency Pair Panel, Active Filter Pills & Dataset Rank Badge
Status: COMPLETE ✓ BROWSER CONFIRMED
Started: 2026-04-12
Completed: 2026-04-12
Browser Verified: 2026-04-12

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 35.1 | OverviewTab: Currency pair distribution panel — grouped by pair, sorted by run count, pass rate progress bar per pair, effective/total label | DONE ✓ BROWSER CONFIRMED | high |
| 35.2 | RunsTab: Active filter pill bar — appears below toolbar when any filter is non-default; cyan chips with × to clear individual filters; CLEAR ALL when ≥2 active | DONE ✓ BROWSER CONFIRMED | high |
| 35.3 | RunsTab: Dataset-relative rank badge — `#1 BEST` (green) / `#2` (cyan) / `#3+` (gray) badge per run row ranking proximity to perfect D.O.=1.00 within its dataset; only shows when dataset has ≥2 runs | DONE ✓ BROWSER CONFIRMED | medium |

## Completed: 3/3
## Sprint Status: COMPLETE ✓ BROWSER CONFIRMED

## Notes
- 35.1: `pairMap` reduce builds `{total, effective}` per pair. Null `currency_pair` → "MULTI" key. Sorted by total desc. Pass rate color: ≥80% green, ≥60% amber, else red. `gridColumn:"1/-1"` full-width. Renders when ≥1 run.
- 35.2: `activeFilters` array built from 9 possible filter conditions (search, stdFilter, verdictFilter, tagFilter, showStarredOnly, dateFrom, dateTo, doMin, doMax). Returns null when empty. "FILTERS:" label prefix. CLEAR ALL resets all 9 filter states at once. Verified: VERDICT: EFFECTIVE chip shows + × dismiss; correct absence when no filters active.
- 35.3: `dsRunGroups` computed by dataset_id from all `runs`. `dsRankMap` keyed by run_id → rank (1-based). Sort by `|D.O. - 1.00|` ascending. Badge skipped when dataset has <2 runs. `#1 BEST` green, `#2` cyan. Screenshot: EUR/USD #1 BEST (IFRS_9 run, same D.O.=0.9917 for both → tie broken by array order), #2 on ASC_815 run.
- tsc clean; screenshots: sprint35-runs-filter-pill-rank.png, sprint35-overview-currency-panel.png

---

# Sprint: Sprint 34 — Effectiveness Regime Bar, Enhanced CSV Export & Run Age Display
Status: COMPLETE ✓ BROWSER CONFIRMED
Started: 2026-04-12
Completed: 2026-04-12
Browser Verified: 2026-04-12

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 34.1 | OverviewTab: Effectiveness regime bar — horizontal stacked flex segments showing consecutive runs of same effective/ineffective status; current regime badge; OLDEST←→LATEST footer; segment count label when >8% width | DONE ✓ BROWSER CONFIRMED | high |
| 34.2 | RunsTab: Enhanced CSV export — adds `note` and `tag` columns to existing export; double-quote escaping for note field; unchanged filename/trigger | DONE ✓ BROWSER CONFIRMED | medium |
| 34.3 | RunsTab: Human-readable run age — `showAge` state + `runAge()` utility (s/m/h/d/w/mo/y tiers); click date cell to toggle between date and age display; column header updates to AGE/DATE | DONE ✓ BROWSER CONFIRMED | medium |

## Completed: 3/3
## Sprint Status: COMPLETE ✓ BROWSER CONFIRMED

## Notes
- 34.1: Consecutive segments computed via forward sort + run-length encoding into `{effective, count}[]`. Flex proportional widths (no calc/%). Past segments at 30% opacity, current full opacity. Green=effective, red=ineffective. Count label suppressed when segment ≤8% of total. Current regime badge shows "CURRENT: EFFECTIVE ×N" or "CURRENT: INEFFECTIVE ×N". Tested: two test runs both effective → 1 green segment.
- 34.2: Rewrote `handleExportCsv` header to `run_id,dataset_name,currency_pair,standard,dollar_offset_ratio,regression_r_squared,overall_effective,run_hash,created_at,note,tag`. Note field uses `"${(note).replace(/"/g, '""')}"` for RFC 4180 escaping. Tag appended as plain string.
- 34.3: `showAge` useState initialized false. `runAge(dateStr)` cascades through sec/min/hr/day/week/month/year tiers. Column header is `showAge ? "AGE" : "DATE"`. Date cell onClick: `e.stopPropagation(); setShowAge(v => !v)`. Browser confirmed: `4/12/2026` → `3h` on click.
- tsc clean; screenshots: sprint34-regime-bar.png, sprint34-runs-age-toggle.png

---

# Sprint: Sprint 33 — Pin-to-Top, Worst Performers & Quick Delta Bar
Status: COMPLETE ✓ BROWSER CONFIRMED
Started: 2026-04-12
Completed: 2026-04-12
Browser Verified: 2026-04-12

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 33.1 | RunsTab: Pin-to-top runs (📌 button per row; pinned rows float above sort; cyan left-border indicator; `hec_pinned_runs` localStorage; max 3) | DONE ✓ BROWSER CONFIRMED | high |
| 33.2 | OverviewTab: Worst performers panel (top 3 ineffective runs by distance from band; rank badges; D.O. value + dist label + date; only when ineffective runs exist) | DONE ✓ BROWSER CONFIRMED | high |
| 33.3 | RunsTab: Inline delta bar when exactly 2 rows selected (QUICK Δ: D.O.Δ, R²Δ, AGREE/DISAGREE verdict; dismisses when compare modal opens) | DONE ✓ BROWSER CONFIRMED | medium |

## Completed: 3/3
## Sprint Status: COMPLETE ✓ BROWSER CONFIRMED

## Notes
- 33.1: IIFE wrapper `(() => { pinnedRows; unpinnedRows; pageRows; allRows.map(...) })()` in ternary flat branch. Pinned rows prepended before paginated unpinned rows. Cyan left-border for pinned rows (replaces green/red). localStorage `hec_pinned_runs`. Max 3 pinned enforced in `togglePin`.
- 33.2: `distFromBand = ratio < 0.80 ? 0.80 - ratio : ratio > 1.25 ? ratio - 1.25 : 0`. Sort desc. Panel hidden when `ineffective.length === 0`. Red border card. Rank circles #1/#2/#3 in red/amber/gray.
- 33.3: Evaluates when `selectedIds.size === 2 && !compareOpen`. Destructures Set to get idA/idB. D.O.Δ and R²Δ signed with color (green=pos, red=neg). AGREE/DISAGREE verdict chip.
- Browser: pin localStorage confirmed (1 pinned), QUICK Δ shows "AGREE" for 2 effective runs, WORST PERFORMERS hidden (0 ineffective runs — correct)
- tsc clean; screenshot: sprint33-runs-features.png

---

# Sprint: Sprint 32 — Standard Donut, D.O. Drift Alert & Monthly Heatmap
Status: COMPLETE ✓ BROWSER CONFIRMED
Started: 2026-04-12
Completed: 2026-04-12
Browser Verified: 2026-04-12

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 32.1 | OverviewTab: Standard breakdown donut (ECharts donut by IAS_39/IFRS_9/ASC_815) + PASS RATE BY STANDARD progress bars | DONE ✓ BROWSER CONFIRMED | high |
| 32.2 | DatasetsTab: D.O. drift alert badge (⚠ DRIFT ±X.XXX in accordion header when run-over-run |delta| ≥ 0.10; amber <0.15, green/red ≥0.15) | DONE ✓ BROWSER CONFIRMED | high |
| 32.3 | RunsTab: Monthly performance heatmap (Jan–Dec row for current year; green/amber/red by pass rate; current month cyan-bordered; — for empty months) | DONE ✓ BROWSER CONFIRMED | medium |

## Completed: 3/3
## Sprint Status: COMPLETE ✓ BROWSER CONFIRMED

## Notes
- 32.1: `STD_META` map for IAS_39/IFRS_9/ASC_815 → label+color. Donut `radius:["52%","78%"]`, `emphasis:{scale:false}`. Pass rate bars use same color per standard. `gridColumn:"1/-1"` full-width layout.
- 32.2: `dsDrift` computed in DatasetsTab alongside `dsStats`. Badge suppressed when |drift| < 0.10. Test data drift=0.000 → no badge (correct). Badge renders as amber for 0.10–0.15, green/red for ≥0.15.
- 32.3: Threshold lowered to `>= 1` run (was 3). Month labels hard-coded `["JAN"..."DEC"]` for locale-safety. APR confirmed 100% pass rate with 2 test runs. `hasAnyData` guard hides heatmap in years with no run data.
- tsc clean; screenshots: sprint32-1-standard-donut.png, sprint32-3-monthly-heatmap.png

---

# Sprint: Sprint 31 — D.O. Band Bar, Streak KPI & Dataset Statistics Pills
Status: COMPLETE ✓ BROWSER CONFIRMED
Started: 2026-04-12
Completed: 2026-04-12
Browser Verified: 2026-04-12

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 31.1 | RunsTab: D.O. ratio compound cell — ratio value + 3px mini bar showing position within 0.70–1.35 range with green band zone (0.80–1.25) highlight and colored dot marker | DONE ✓ BROWSER CONFIRMED | high |
| 31.2 | OverviewTab: CURRENT STREAK + BEST STREAK KPI tiles (consecutive effective runs from most-recent backward; 🔥 at ≥5; amber warning if streak broken) | DONE ✓ BROWSER CONFIRMED | high |
| 31.3 | DatasetsTab accordion: dataset statistics summary pills (MEAN D.O., STD DEV, MIN, MAX, PASS RATE) rendered before ASSESSMENT HISTORY label when ≥1 run exists | DONE ✓ BROWSER CONFIRMED | medium |

## Completed: 3/3
## Sprint Status: COMPLETE ✓ BROWSER CONFIRMED

## Notes
- 31.1: Compound cell: ratio text (green/amber/red) + 3px bar + 5×5 dot. Band zone (0.80–1.25) shaded rgba(5,150,105,0.15). Dot position: pct=((ratio-0.70)/0.65)*100 clamped 0–100. nearEdge when in-band but <0.84 or >1.21 → amber.
- 31.2: O(n) forward pass for best streak; reverse pass from tail for current streak. Tiles rendered only when runs.length>=1. 🔥 emoji if current>=5, amber warning chip if current=0 and best>0.
- 31.3: Stats computed from accordion-expanded dataset's runs. Pills: chip-style with label/value rows. PASS RATE = effective/total * 100. Browser confirmed: MEAN D.O. 0.9917, STD DEV 0.0000, PASS RATE 100%.
- tsc clean; screenshot evidence: sprint31-1-do-band-bar.png, sprint31-2-streak.png, sprint31-3-dataset-stats-pills.png

---

# Sprint: Sprint 30 — Run Notes, Evidence Binder Download & Effectiveness Timeline
Status: COMPLETE ✓ BROWSER CONFIRMED
Started: 2026-04-12
Completed: 2026-04-12
Browser Verified: 2026-04-12

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 30.1 | RunsTab: per-run analyst notes (localStorage `hec_run_notes`; inline input on hover/click; italic grey text when set; Enter to save, Escape to cancel) | DONE ✓ BROWSER CONFIRMED | high |
| 30.2 | RunsTab: evidence binder download button per row (↓ icon; `GET /runs/{id}/export` → `he-binder-{id}.json`; spinner guard) | DONE ✓ BROWSER CONFIRMED | high |
| 30.3 | OverviewTab: EFFECTIVENESS TIMELINE scatter chart (last 30 runs with D.O. data; x=date, y=D.O. ratio; green/red dots; band lines at 0.80/1.25; ECharts scatter) | DONE ✓ BROWSER CONFIRMED | medium |

## Completed: 3/3
## Sprint Status: COMPLETE ✓ BROWSER CONFIRMED

## Notes
- 30.1: `RUN_NOTES_KEY="hec_run_notes"`; `editNoteRunId` state; shows `+ note` on hover when no note set; italic text when note exists; click to edit; `saveRunNote()` persists to localStorage
- 30.2: `downloadBinder(runId)` async fn; `dashboardFetch` with bearer token; JSON blob → anchor click; `downloadingId` spinner guard; clock icon while downloading
- 30.3: ECharts scatter, `type:"scatter"`, `type:"line"` series with markLine for bands; `itemStyle.color` fn → green/red by `overall_effective`; tooltip shows dataset + D.O. + verdict
- tsc clean; hot reload confirmed in browser

---

# Sprint: Sprint 29 — Compare Export, Dataset Clone & D.O. Sparkline
Status: COMPLETE ✓ BROWSER CONFIRMED
Started: 2026-04-10
Completed: 2026-04-10
Browser Verified: 2026-04-12

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 29.1 | Compare modal: EXPORT CSV button (client-side Blob download; columns: run_id, dataset, standard, do_ratio, r_squared, verdict, date) | DONE ✓ BROWSER CONFIRMED | high |
| 29.2 | Dataset clone: `POST /datasets/{id}/clone` backend + amber copy-icon button in DatasetsTab row (cloningId spinner guard) | DONE ✓ BROWSER CONFIRMED | high |
| 29.3 | DatasetsTab accordion: per-dataset D.O. ratio trend sparkline (ECharts SVG line; effective band dashes; point colours; only shown when ≥2 runs with D.O. data) | DONE ✓ BROWSER CONFIRMED | medium |

## Completed: 3/3
## Sprint Status: COMPLETE ✓ BROWSER CONFIRMED

## Notes
- 29.1: Pure client-side; no backend; CSV constructed from in-memory `compareRuns`; `URL.createObjectURL` + anchor click + `revokeObjectURL`; button in modal header between title and close icon
- 29.2: Backend `POST /datasets/{id}/clone` → copies period data + metadata, appends '(Copy)', new UUID, emits audit event. Frontend: `handleCloneDataset` in Inner; `onCloneDataset` prop on DatasetsTab; `cloningId` state guards double-click; amber hover
- 29.3: ECharts SVG renderer (height=80); filtered to dataset runs with non-null D.O.; chronological sort; green dashed band lines at 0.80/1.25; series point colors green/red by band membership; tooltip shows date + D.O. ratio
- Backend tests: 4801 passed, 158 skipped (no regressions)
- tsc clean (no output from noEmit)

---

# Sprint: Sprint 28 — Bulk Tag, Period Viewer & Rolling Pass-Rate
Status: COMPLETE ✓ BROWSER CONFIRMED
Started: 2026-04-10
Completed: 2026-04-10
Browser Verified: 2026-04-12

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 28.1 | RunsTab: bulk tag all selected (TAG ALL dropdown → REVIEW/APPROVED/FLAGGED/Clear; applies to all selectedIds in localStorage) | DONE ✓ BROWSER CONFIRMED | high |
| 28.2 | DatasetsTab: period data viewer (VIEW DATA toggle in accordion → fetches GET /datasets/{id} → scrollable period table with cumulative D.O.) | DONE ✓ BROWSER CONFIRMED | high |
| 28.3 | OverviewTab: rolling pass-rate KPI (LAST 5 / LAST 10 / ALL toggle; shows % + Δpp vs prior window) | DONE ✓ BROWSER CONFIRMED | medium |

## Completed: 3/3
## Sprint Status: COMPLETE ✓ BROWSER CONFIRMED

## Notes
- 28.1: `tagBulkOpen` state + `applyBulkTag()` in RunsTab; shares TAGS_KEY/TAG_COLORS/TagValue with existing per-run tag system; dropdown mirrors per-run tag menu; appears when selectedIds.size >= 1
- 28.2: `viewDataId/periodsCache/loadingPeriods/toggleViewData` state in DatasetsTab; `token` prop added; lazy fetch from `GET /v1/hedge-effectiveness/datasets/{id}`; table shows index, date, hedged FV Δ, instrument FV Δ, cumulative D.O. (green if in band, red if out); backend: new `GET /datasets/{dataset_id}` endpoint returns metadata + periods array
- 28.3: `passWindow: 5|10|0` local state in OverviewTab; sorted desc by created_at; window slice + prior window slice; delta in pp vs prior; cyan/amber/red by pass %
- tsc clean, next build clean (99/99 static pages)

---

# Sprint: Sprint 27 — Bulk Delete, Dataset Editor & Best/Worst Tile
Status: COMPLETE [PENDING BROWSER CONFIRMATION]
Started: 2026-04-10
Completed: 2026-04-10

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 27.1 | RunsTab: bulk delete selected runs (trash button → inline confirm → POST /runs/batch-delete) | DONE [PENDING BROWSER CONFIRMATION] | high |
| 27.2 | DatasetsTab: dataset metadata editor (pencil icon → inline edit form for name/pair/designation date → PATCH /datasets/{id}) | DONE [PENDING BROWSER CONFIRMATION] | high |
| 27.3 | OverviewTab: best/worst run tile (D.O. ratio closest to 1.0 vs most out-of-band; clickable to run detail) | DONE [PENDING BROWSER CONFIRMATION] | medium |

## Completed: 3/3
## Sprint Status: COMPLETE [PENDING BROWSER CONFIRMATION]

## Notes
- 27.1: `deleteConfirm` + `deleting` state in RunsTab; trash icon in toolbar when ≥1 selected; inline confirm strip (red); `onDeleteRuns` prop; backend: `POST /v1/hedge-effectiveness/runs/batch-delete`, `BatchDeleteRunsRequest`, tenant-scoped deletes, audit event
- 27.2: `editingDsId/editName/editPair/editDesig/saving` state in DatasetsTab; pencil icon in each row last column; edit strip in accordion body; `onUpdateDataset` prop; backend: `PATCH /v1/hedge-effectiveness/datasets/{dataset_id}`, `UpdateDatasetRequest`; `designation_date` added to Dataset interface
- 27.3: Pure OverviewTab computation; effective runs sorted by abs(D.O.-1.0); ineffective sorted by max distance; `RunCard` sub-component; only shown when ≥2 runs; green/red accent bars; clickable to run detail
- tsc clean (no errors), next build clean (only pre-existing warnings)

---

# Sprints 16–26 — COMPLETE ✓ (reconstructed from git log)

| Sprint | Commit | Delivered |
|--------|--------|-----------|
| 16 | 986e76d | RE-RUN button, date range filter, effectiveness streak |
| 17 | f7b4fa8 | Health matrix, out-of-band markers, export selected |
| 18 | a78483a | Monthly chart, smart compliance notes, pagination |
| 19 | baba3fd | KPI tiles, sibling runs panel, search highlight |
| 20 | ed0658b | Risk alerts, JSON export, perfect hedge line |
| 21 | e21ec11 | Group-by-dataset, hash chain viz, assessment cadence |
| 22 | 7d37261 | D.O. range filter, row density toggle, worst performers |
| 23 | 15067e4 | Filter presets, trend direction badge, anomaly flags |
| 24 | e1dbb63 | Column visibility, hover popover, activity calendar heatmap |
| 25 | 7f0388c | Keyboard nav, quick tags, dataset sticky notes |
| 26 | 788921d | Tag filter, D.O. statistics panel, per-run analyst notes |

---

# Sprint: Sprint 15 — Comparison, Trend & Print — COMPLETE ✓
Started: 2026-04-05 | Completed: 2026-04-05 | Commit: ed43065

---

# Sprint: Sprint 14 — Bookmarks, Unassessed Alert & Dataset Sort — COMPLETE ✓
Started: 2026-04-05
Completed: 2026-04-05

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 14.1 | RunsTab: star/bookmark runs with localStorage persistence | DONE [PENDING BROWSER CONFIRMATION] | high |
| 14.2 | OverviewTab: unassessed datasets alert panel | DONE [PENDING BROWSER CONFIRMATION] | medium |
| 14.3 | DatasetsTab: sort selector (newest/name/runs/last assessed) | DONE [PENDING BROWSER CONFIRMATION] | medium |

## Completed: 3/3
## Sprint Status: COMPLETE [PENDING BROWSER CONFIRMATION]

---

# Sprint: Sprint 12 — Standards Breakdown & Distribution — COMPLETE ✓
Started: 2026-04-04
Completed: 2026-04-04

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 12.1 | Overview: per-standard KPI tiles (pass rate % + mini bar per standard) | DONE [PENDING BROWSER CONFIRMATION] | medium |
| 12.2 | Overview: D.O. ratio distribution histogram (ECharts, 10 bins 0.5–1.5, green band, threshold markers) | DONE [PENDING BROWSER CONFIRMATION] | high |
| 12.3 | Run detail: regression narrative panel (qualitative interpretation of R² and slope values) | DONE [PENDING BROWSER CONFIRMATION] | medium |

## Completed: 3/3
## Sprint Status: COMPLETE [PENDING BROWSER CONFIRMATION]

## Notes
- 12.1: `page.tsx` OverviewTab — groups runs by standard, shows only when ≥2 standards; % pass rate with green/amber/red, mini progress bar
- 12.2: `page.tsx` OverviewTab — fixed bin edges [0.5..1.5], green bars for effective band, ECharts markArea green overlay, shows only when runs.length ≥ 3
- 12.3: `runs/[run_id]/page.tsx` RegressionPanel — deterministic text for 4 R² tiers + slope in/out band; pill badge + prose sentence
- tsc clean, next build clean

---

# Sprint: Sprint 11 — Runs Sort & Upload Intelligence — COMPLETE ✓
Started: 2026-04-04
Completed: 2026-04-04

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 11.1 | RunsTab: sortable column headers (DATASET, D.O. RATIO, R², VERDICT, DATE) with chevron | DONE [PENDING BROWSER CONFIRMATION] | high |
| 11.2 | UploadTab: live D.O. ratio preview panel (appears once ≥2 filled periods, IN/OUT BAND) | DONE [PENDING BROWSER CONFIRMATION] | high |
| 11.3 | UploadTab: inline row validation (non-numeric values get red border on hedged/instrument inputs) | DONE [PENDING BROWSER CONFIRMATION] | medium |

## Completed: 3/3
## Sprint Status: COMPLETE [PENDING BROWSER CONFIRMATION]

## Notes
- 11.1: `SortKey` type + `sortKey/sortDir` state; `displayRuns = [...filteredRuns].sort(...)`; column headers are buttons with up/down SVG chevron; null-safe via -Infinity for missing ratios
- 11.2: IIFE after period rows; sums all filled periods; ratio = abs(instr)/abs(hedged); green/red banner with D.O. value, IN/OUT BAND pill, filled count
- 11.3: `hedgedInvalid`/`instrInvalid` flags per row; non-empty + NaN = red border; blurs to cyan if valid
- tsc clean, next build clean

---

# Sprint: Sprint 10 — Run Detail Polish — COMPLETE ✓
Started: 2026-04-04
Completed: 2026-04-04

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 10.1 | Period table: out-of-band row highlighting (red tint + IN/OUT badge on CUM RATIO), footer summary | DONE [PENDING BROWSER CONFIRMATION] | high |
| 10.2 | Keyboard navigation: ← prev run, → next run, Esc → back to runs list | DONE [PENDING BROWSER CONFIRMATION] | medium |
| 10.3 | Copy summary button in run detail header (dataset, standard, verdict, D.O., R², hash → clipboard) | DONE [PENDING BROWSER CONFIRMATION] | medium |

## Completed: 3/3
## Sprint Status: COMPLETE [PENDING BROWSER CONFIRMATION]

## Notes
- All work in: `frontend/src/app/hedge-effectiveness/runs/[run_id]/page.tsx`
- 10.1: `outOfBand` flag drives `background: red08`, `borderLeft: red40`; IN/OUT pill replaces dot; footer shows "N PERIODS | ✓ X IN BAND | ✗ Y OUT OF BAND"
- 10.2: `useEffect` on `allRunIds + runId`; skips input/textarea targets; separate from `load` effect
- 10.3: `navigator.clipboard.writeText` with 2s `copied` flash state; copies 8-field summary
- tsc clean, next build clean

---

# Sprint: Sprint 9 — Overview Depth & Dataset Drill-down — COMPLETE ✓
Started: 2026-04-04
Completed: 2026-04-04

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 9.1 | Portfolio health gauge in Overview (ECharts semicircular gauge, pass rate %) | DONE [PENDING BROWSER CONFIRMATION] | medium |
| 9.2 | Recent assessments feed in Overview (last 6 runs, clickable timeline) | DONE [PENDING BROWSER CONFIRMATION] | medium |
| 9.3 | DatasetsTab accordion expand (click row → show last 3 runs with verdict + D.O.) | DONE [PENDING BROWSER CONFIRMATION] | high |

## Completed: 3/3
## Sprint Status: COMPLETE [PENDING BROWSER CONFIRMATION]

## Notes
- All work in: `frontend/src/app/hedge-effectiveness/page.tsx`
- 9.1: ECharts gauge, startAngle 200/endAngle -20, color zones (green/amber/red by pass rate)
- 9.2: Last 6 runs sorted desc by created_at, colored dot, dataset name, currency, date, clickable
- 9.3: DatasetsTab: `expandedId` state, chevron toggle, sub-section shows last 3 runs per dataset_id; `onNavigateRun` prop added; RUN ASSESSMENT button stopPropagation to avoid accordion toggle
- tsc clean, next build clean

---

# Sprint: Sprint 8 — Dataset Intelligence & Run Navigation — COMPLETE ✓
Started: 2026-04-04
Completed: 2026-04-04

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 8.1 | Per-dataset run summary badge in DatasetsTab (run count + last verdict pill) | DONE [PENDING BROWSER CONFIRMATION] | medium |
| 8.2 | Dataset search/filter bar in DatasetsTab (text search by name or pair) | DONE [PENDING BROWSER CONFIRMATION] | high |
| 8.3 | Run detail prev/next navigation arrows (← PREV N/total NEXT →) | DONE [PENDING BROWSER CONFIRMATION] | medium |

## Completed: 3/3
## Sprint Status: COMPLETE [PENDING BROWSER CONFIRMATION]

## Notes
- 8.1 + 8.2: `frontend/src/app/hedge-effectiveness/page.tsx` — DatasetsTab: added `runs: Run[]` prop, `dsStats` map computed from runs grouped by dataset_id, per-row verdict badge + run count
- 8.2: search input filters `filteredDs` by name or currency_pair; shows "N OF M" count
- 8.3: `frontend/src/app/hedge-effectiveness/runs/[run_id]/page.tsx` — parallel fetch of `/v1/hedge-effectiveness/runs`; sorted by `created_at` desc; prev/next computed from `allRunIds.indexOf(runId)`; arrows hidden when only 1 run
- tsc clean, next build clean

---

# Sprint: Sprint 7 — Analytics & Export — COMPLETE ✓
Started: 2026-04-04
Completed: 2026-04-04

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 7.1 | PASS RATE KPI tile (5th tile in header strip, green ≥ 80%) | DONE ✓ BROWSER CONFIRMED | medium |
| 7.2 | Effectiveness trend stacked bar chart in Overview tab (ECharts, last 20 runs) | DONE ✓ BROWSER CONFIRMED | medium |
| 7.3 | Filter toolbar on ASSESSMENT RUNS tab (text search, standard, verdict) | DONE ✓ BROWSER CONFIRMED | high |
| 7.4 | CSV export button on ASSESSMENT RUNS tab (exports filtered runs) | DONE ✓ BROWSER CONFIRMED | high |

## Completed: 4/4
## Sprint Status: COMPLETE ✓

## Browser Confirmation Evidence (2026-04-04)
- 7.1: KPI strip shows "PASS RATE 66.7%" (2 effective / 3 total — correct)
- 7.2: "EFFECTIVENESS TREND" chart rendered in Overview tab
- 7.3: Verdict pills ALL/EFFECTIVE/INEFFECTIVE present; INEFFECTIVE filter → "1 OF 3 RUNS" showing only GBP/USD
- 7.4: "EXPORT CSV" button present in Runs toolbar

## Notes
- All work in: `frontend/src/app/hedge-effectiveness/page.tsx`
- ECharts loaded via `dynamic(() => import("echarts-for-react"), { ssr: false })`
- CSV export uses createObjectURL blob pattern (no backend call)
- Filter is client-side only — no new API endpoints
- tsc clean, next build clean (422f4ad)

---

# Sprint: Sprint 6 — Regulatory Reporting (IFRS 9 / ASC 815) — COMPLETE ✓
Started: 2026-04-04
Completed: 2026-04-04

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 6.1 | IFRS 9 XML + ASC 815 XML download buttons on run detail page header | DONE ✓ BROWSER CONFIRMED | high |
| 6.2 | Fix PageShell-inside-traces.map() bug on run detail page | DONE | high |
| 6.3 | Add designation_date to RunDetail interface + header metadata strip | DONE ✓ BROWSER CONFIRMED | medium |
| 6.4 | Fix PageShell-inside-RunsTab bug on hedge-effectiveness/page.tsx | DONE | high |
| 6.5 | At-risk hedges monitor in OverviewTab (approaching 0.80 lower / 1.25 upper boundary) | DONE ✓ BROWSER CONFIRMED | medium |
| 6.6 | Methodology & Standards disclosure panel in ComplianceSection (EVIDENCE tab) | DONE | medium |

## Completed: 6/6
## Sprint Status: COMPLETE ✓

## Browser Confirmation Evidence (2026-04-04)
- 6.1: "IFRS 9 XML" + "ASC 815 XML" buttons visible in run detail header
- 6.3: "Designated: 2026-01-01" rendered in header metadata strip
- 6.5: "AT-RISK HEDGES — 1 approaching effectiveness boundary" banner with USDJPY run flagged NEAR LOWER BOUND (D.O. 0.8300)
- 6.6: Run detail page rendered cleanly with ComplianceSection loading (no render errors)
- At-risk boundary fix confirmed: ratio > 0.80 (exclusive) correctly flags 0.83 but would not flag 0.80

## Notes
- Backend XML endpoints were pre-built (Sprint: Regulatory Reporting Exports, 2026-03-20)
- Frontend: tsc clean, next build passed (after cache clean), 4801 tests passed 158 skipped
- Run detail page: `frontend/src/app/hedge-effectiveness/runs/[run_id]/page.tsx`
- Download handler uses `dashboardFetch` to `/v1/hedge-effectiveness/runs/{run_id}/ifrs9-xml` or `/asc815-xml`
- At-risk monitor: flags hedges within 10% of 0.80 lower / 1.25 upper IFRS 9 boundary
- Methodology panel: accounting standard, methodology version, dollar-offset/regression pass/fail, hedge type, designation date with standards citations (IFRS 9.6.4.1 / ASC 815-20-25)

## Human Actions Pending (carried from Sprint 5)
- BROWSER: Verify IFRS 9 / ASC 815 XML download buttons on run detail page
- Run k6 full load test against Render staging (100 VUs, 5 min) — populate docs/performance/load-test-baseline.md
- Add WORKOS_API_KEY, WORKOS_CLIENT_ID to Render env vars
- Add STRIPE_SECRET_KEY_TEST, STRIPE_WEBHOOK_SECRET to Render env vars
- Add SENTRY_DSN to Render + Vercel env vars
- Run scripts/scrub-git-secrets.sh (git history scrub)
- Rotate all API keys

---

# Sprint: Sprint 5 — Scale & Performance — COMPLETE
Started: 2026-03-28
Completed: 2026-03-29

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 5.1 | k6 load testing baseline (100 concurrent users, p95 < 500ms) | DONE | high |
| 5.2 | Market data caching in Redis (60s TTL, cache-hit counter on /system/health) | DONE | high |
| 5.3 | Connection pool tuning (pool_size=20, max_overflow=10) | DONE | high |
| 5.4 | Webhook support (POST/GET/DELETE /v1/webhooks, HMAC-SHA256 signed delivery) | DONE | medium |
| 5.5 | Horizontal scaling prep (stateless deployment docs, multi-instance topology) | DONE | medium |

## Completed: 5/5
## Validation: 4801 passed, 0 failed, 158 skipped; 27 files changed, 2196 insertions

---

# Sprint: Sprint 4 — Compliance Pipeline — COMPLETE ✓
Started: 2026-03-28
Completed: 2026-03-28

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 4.1 | SOC2 Controls Matrix | DONE | high |
| 4.2 | GDPR Enforcement — data export + erasure endpoints + retention job | DONE | high |
| 4.3 | Tenant Isolation Audit — RLS policies on positions + calculation_runs | DONE | high |
| 4.4 | Vendor Security Registry | DONE | medium |

## Completed: 4/4
## Validation: 4767 passed, 0 failed, 158 skipped

---

# Sprint: Sprint 3 — SSO + Billing — COMPLETE ✓
Started: 2026-03-28
Completed: 2026-03-28

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 3.1 | WorkOS SSO: POST /auth/sso/callback | DONE | high |
| 3.2 | Stripe billing webhook (invoice.paid / payment_failed / subscription.deleted) | DONE | high |
| 3.3 | Plan enforcement: require_plan_tier() FastAPI dependency | DONE | high |
| 3.4 | Self-service signup: POST /v1/signup (atomic Company + User + GENESIS) | DONE | high |
| 3.5 | GENESIS hash chain: provision_tenant() + test_genesis_hash_chain.py | DONE | high |
| 3.6 | Frontend signup wizard: /signup 3-step wizard | DONE | medium |
| 3.7 | Scalar API docs: GET /docs route handler | DONE | medium |
| 3.8 | DB migration h1a2b3c4d5e6: sso_provider, sso_domain, stripe_customer_id, stripe_subscription_id, plan_tier | DONE | high |

## Completed: 8/8
## Validation: 4746 passed, 0 failed, 156 skipped

---

# Sprint: Live Market Data Integration
Started: 2026-03-22

## Goals
Wire all 5 live providers end-to-end, validate sandbox autofill→calculate flow,
rotate production secrets, and close the remaining HIGH risks.

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 1 | Secret rotation — Render + Vercel env vars | open | high |
| 2 | IBKR: enable when TWS running — verify CIP forward points live | blocked | high |
| 3 | Sandbox end-to-end: autofill → calculate with live spot | DONE | high |
| 4 | Wire Twelve Data to backend market routes (complement yfinance) | DONE | medium |
| 5 | Dashboard FX rates widget: verify live data renders | DONE | medium |
| 6 | frontend-v2: reconcile deleted files or remove from git tracking | DONE | medium |
| 7 | Close risk #2 (market data feed) once IBKR confirmed live | blocked | low |

## Completed: 4/7
## Sprint Status: IN PROGRESS

## Provider Status (2026-03-25)
| Provider | Status | Key |
|---|---|---|
| yfinance | ✅ live | none needed |
| Twelve Data | ✅ live — verified prod 2026-03-25 (EURUSD 1.1564, USDJPY 159.35, USDMXN 17.78) | ea3629bd... |
| Alpha Vantage | ✅ live | 00GCMPHP... |
| Finnhub | ✅ live | d6h68mpr... |
| exchangerate-api.com | ✅ live | none needed |
| IBKR | ⏳ blocked | requires TWS on port 4001 |

## Key Fix 2026-03-25
- `fix(middleware)`: /api/v1/market-data/live/* added to public_prefixes in APIKeyAuthMiddleware
  → TwelveData provider chain now active in production (was falling back to exchangerate-api.com due to 401)
- Production DB stamped: alembic_version = 2026_03_24_baseline

## Provider Status (2026-03-22 — historical)
| Provider | Status | Key |
|---|---|---|
| yfinance | ✅ live | none needed |
| Twelve Data | ✅ live | 76ffbba2... |
| Alpha Vantage | ✅ live | 00GCMPHP... |
| Finnhub | ✅ live | d6h68mpr... |
| exchangerate-api.com | ✅ live | none needed |
| IBKR | ⏳ pending | requires TWS on port 4001 |

---

# Sprint: Regulatory Reporting Exports — COMPLETE ✓
Started: 2026-03-20
Completed: 2026-03-20

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 1 | export_ifrs9_xml service function + 11 unit tests | DONE | high |
| 2 | GET /{run_id}/isda endpoint (v1_reports.py) | DONE | high |
| 3 | GET /{run_id}/finra-17a4 endpoint (v1_reports.py) | DONE | high |
| 4 | GET /runs/{run_id}/ifrs9-xml endpoint (v1_hedge_effectiveness.py) | DONE | high |
| 5 | GET /runs/{run_id}/asc815-xml endpoint (v1_hedge_effectiveness.py) | DONE | high |
| 6 | RegulatoryTab.tsx — 4 new cards + hedge accounting section | DONE | high |
| 7 | API_CONTRACTS.md — document 4 new endpoints | DONE | medium |

## Completed: 7/7
## Validation: 4615 passed, 154 skipped, 0 failed. Frontend build clean.

## Previous Sprint: Market Intelligence & Portfolio Expansion (COMPLETED 2026-03-19, 9/9 items)

---

# Sprint: Market Intelligence & Portfolio Expansion
Started: 2026-03-19

## Goals
1. Wire Watchlist backend persistence + real-time WebSocket ticks (Option A)
2. Portfolio Multi-Currency Matrix — correlation heatmap, concentration alerts (Option B)
3. Settings tab audit + complete any stubs (Option C)
4. Governance visualization — ledger hash chain, merkle layout (Option D)
5. Signals alerting engine — custom rules, alert triggers (Option E)

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 1 | [A] Backend: UserWatchlist model + CRUD routes + migration | DONE | high |
| 2 | [A] Frontend: WatchlistsTab → backend sync + localStorage fallback | DONE | high |
| 3 | [A] Frontend: useMarketTicker hook → WebSocket live prices in watchlist | DONE | high |
| 4 | [B] Portfolio Multi: 26-pair correlation heatmap + concentration alerts | DONE | high |
| 5 | [B] Portfolio Multi: hedging recommendations panel | DONE | medium |
| 6 | [C] Settings: audit all 12 tabs, build out any stubs | DONE | medium |
| 7 | [D] Ledger: hash chain visualization + merkle tree layout | DONE | medium |
| 8 | [D] Audit Trail: event grouping + impact analysis | DONE | low |
| 9 | [E] Signals: custom alert rules engine (frontend UI) | DONE | low |

## Completed: 9/9
## Sprint Status: COMPLETE ✓

## Previous Sprint: Admin Hub (COMPLETED 2026-03-15, 9/9 items)

---

# Sprint: Admin Hub
Started: 2026-03-15
Completed: 2026-03-18

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 1 | Backend tests — users, tenants, roles, config, metrics | DONE | high |
| 2 | Frontend hub shell + AdminTabBar + sidebar update | DONE | high |
| 3 | OperationsTab + DevOpsTab | DONE | high |
| 4 | UsersTab + TenantsTab | DONE | high |
| 5 | RolesTab + ApiKeysTab | DONE | high |
| 6 | MetricsTab + ConfigTab | DONE | high |
| 7 | Delete old broken pages + full build | DONE | high |
| 8 | E2E spec (admin.spec.ts) | DONE | medium |
| 9 | Final validation + push | DONE | medium |

## Completed: 9/9
