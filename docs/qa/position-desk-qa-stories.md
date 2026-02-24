# Position Desk - QA Test Stories
**Sprint:** 1.9-position-desk-hardening  
**Author:** QA Engineering  
**Standard:** Bloomberg/BlackRock Institutional Grade  
**Last Updated:** 2026-02-24  
**Scope:** FXDemo - Position Desk (`/input` route), Manual Entry, CSV Import, Connection Hub, Audit Trail, Demo Mode Isolation  

---

## Overview

This document defines the acceptance test stories for the Position Desk module.
Every test case must be executed by a named QA engineer and countersigned by the
product owner before the sprint is marked Done. Regulatory stories (WORM, hash
chain, user attribution) require a second signature from the Compliance liaison.

**Pass criteria:** All TC cells populated with PASS. Zero FAIL or BLOCKED items.  
**Blocking defects:** Any FAIL in a WORM, hash-chain, or data-isolation story blocks release regardless of overall pass rate.

---

## Story PD-001: Manual Entry - Value Date Picker
**Given** I am on the Position Desk Manual Entry tab  
**When** I click the Value Date field  
**Then** a Bloomberg-style calendar picker opens, restricts past dates, and writes the selected date in ISO 8601 format  

**Priority:** P1 - Blocking  
**Linked components:** `InlineDatePicker`, `TradeModal`  

### Test Cases
| # | Steps | Expected | Pass/Fail |
|---|-------|----------|-----------|
| TC-001-1 | Navigate to `/input`. Click the Manual Entry tab. Click the VALUE DATE input field. | Calendar popup opens immediately with the current month visible. | |
| TC-001-2 | With calendar open, click any future date. | Selected date appears in the text field as `YYYY-MM-DD`. | |
| TC-001-3 | Click the Q2 quick-select button on the calendar. | Calendar view jumps to April of the displayed year; no date is yet committed. | |
| TC-001-4 | Type `2026-06-15` directly in the date text box. | Field updates to `2026-06-15` and calendar view jumps to June 2026. | |
| TC-001-5 | Click a grayed-out past date (e.g., yesterday). | Nothing happens. Text field date remains unchanged. No error toast fires. | |
| TC-001-6 | Open calendar, then click anywhere outside the popup. | Calendar closes. No date change if no date was selected. | |
| TC-001-7 | Open calendar, then press the Escape key. | Calendar closes immediately. Focus returns to the VALUE DATE input. | |
| TC-001-8 | Type a malformed date `99-99-99` in the text box, then Tab away. | Field shows a red validation border. Tooltip: "Invalid date format - use YYYY-MM-DD". Form cannot be submitted. | |

---

## Story PD-002: Manual Entry - Amount Thousand Separator
**Given** I am on the Manual Entry form  
**When** I type a numeric amount  
**Then** the Amount field formats with comma thousand separators on blur, stores the raw integer on submission, and rejects non-numeric input  

**Priority:** P1 - Blocking  
**Linked components:** `TradeModal` amount field, `positionClient.createPosition`  

### Test Cases
| # | Steps | Expected | Pass/Fail |
|---|-------|----------|-----------|
| TC-002-1 | Click the AMOUNT field. Type `1000000`. Tab away. | Field displays `1,000,000`. Underlying value stored as `1000000`. | |
| TC-002-2 | Clear field, type `500`. Tab away. | Field displays `500`. No extra commas. | |
| TC-002-3 | Clear field, type `0`. Attempt to save. | Validation fires: "Amount must be greater than 0." Save is blocked. | |
| TC-002-4 | Clear field, type `-500000`. Tab away. | Field strips the minus sign OR shows: "Amount must be positive (no sign)." | |
| TC-002-5 | Clear field, type `abc`. Tab away. | Field clears or shows "Numeric value required." Non-numeric characters rejected. | |
| TC-002-6 | Type `1,234,567.89` with a decimal. Tab away. | Field accepts decimal or shows "Whole numbers only" per currency rules. Behavior must match spec. | |
| TC-002-7 | Submit a position with amount `999999999999` (max boundary). | Position saves without overflow. Verify in DB that `amount` column equals exact value. | |

---

## Story PD-003: Edit Position - No Crash on Update
**Given** at least one position exists in the table  
**When** I open the edit modal, change one or more fields, and click Save  
**Then** the row updates in real time with no JavaScript console errors, no network 500 errors, and no page reload  

**Priority:** P1 - Blocking  
**Linked components:** `updatePositionThunk`, `TradeModal`, `TradeTable`  

### Test Cases
| # | Steps | Expected | Pass/Fail |
|---|-------|----------|-----------|
| TC-003-1 | Click the edit (pencil) icon on an existing position row. | Edit modal opens pre-populated with all existing field values. | |
| TC-003-2 | Change the DESCRIPTION field. Click Save. | Row in table updates instantly. Toast confirms "Position updated." No page reload. | |
| TC-003-3 | Change STATUS from FORECAST to CONFIRMED. Click Save. | Status badge in the table switches to CONFIRMED styling. DB record updated. | |
| TC-003-4 | Change CURRENCY to a non-CME currency (if allowed by form). Click Save. | Either form rejects with a clear error, or row saves and warning appears in the Execution column. | |
| TC-003-5 | Rapidly click Save twice (double-submit test). | Only one PATCH request is issued. No duplicate audit trail entries. | |
| TC-003-6 | Edit modal open; simulate session token expiry. Click Save. | Toast shows: "Session expired - please log in again." Modal closes. No partial save. | |
| TC-003-7 | Open edit modal for position with `execution_status = EXECUTED`. Attempt to change AMOUNT. | Amount field is read-only OR validation blocks change with: "Cannot modify executed position." | |
| TC-003-8 | Open browser DevTools Network tab. Edit a position. Verify PATCH payload. | Payload contains `record_id`, changed fields, and `Authorization: Bearer <token>` header. | |

---

## Story PD-004: DB Persistence - Real User Saves to Database
**Given** I am authenticated as a real (non-demo) user  
**When** I create a new position via Manual Entry and reload the page  
**Then** the position persists, has a valid UUID or record ID, and is attributed to my user account in the audit trail  

**Priority:** P1 - Blocking  
**Linked components:** `createPositionThunk`, `listPositionsThunk`, PostgreSQL `positions` table  

### Test Cases
| # | Steps | Expected | Pass/Fail |
|---|-------|----------|-----------|
| TC-004-1 | Create a position with all required fields. Click Save. | 201 response received. Toast: "Position saved." Record appears in the table immediately. | |
| TC-004-2 | Hard-reload the page (Ctrl+Shift+R). | The newly created position is still present, loaded from the database. | |
| TC-004-3 | Query the `positions` table directly, filtering by the new `record_id`. | Row exists with all submitted field values. `created_by` equals the authenticated user ID. | |
| TC-004-4 | Create a position. Log out. Log back in. Navigate to `/input`. | Position is present. Record ID unchanged. | |
| TC-004-5 | Submit a duplicate `record_id` matching an existing position. | Backend returns 409 Conflict. Toast: "Record ID already exists." No duplicate row created. | |
| TC-004-6 | Submit position with all optional fields blank. | Position saves with `description = null`. No validation error for optional fields. | |
| TC-004-7 | Check `created_at` timestamp in DB after save. | Timestamp is UTC, within +-5 seconds of the save action. No epoch-zero or null values. | |

---

## Story PD-005: Position Lifecycle - Status Display
**Given** positions exist with various lifecycle statuses  
**When** I view the Position Desk table  
**Then** each status badge renders in the correct color with the correct label, and the table can be sorted or filtered by status  

**Priority:** P2  
**Linked components:** `TradeTable`, status badge styles, `positionSlice`  

### Test Cases
| # | Steps | Expected | Pass/Fail |
|---|-------|----------|-----------|
| TC-005-1 | Create a position with STATUS = FORECAST. View in table. | Badge is amber/yellow with label FORECAST. | |
| TC-005-2 | Create a position with STATUS = CONFIRMED. View in table. | Badge is green with label CONFIRMED. | |
| TC-005-3 | Execute a position via IBKR flow. View in table. | Badge updates to EXECUTED in cyan or blue. | |
| TC-005-4 | Attempt to set STATUS = EXECUTED manually via the edit modal. | EXECUTED is not available as a manual option, or it is gated behind the execution confirmation flow. | |
| TC-005-5 | Filter the table by CONFIRMED (if filter is available). | Only CONFIRMED rows are visible. Row count in header updates. | |
| TC-005-6 | Verify no position shows an empty or undefined status badge. | Every row has a non-empty, styled status badge. | |
| TC-005-7 | With more than 20 positions of mixed status: verify badge colors across paginated rows. | No badge inherits incorrect color from an adjacent row. | |

---

## Story PD-006: Ingested At Timestamp Display
**Given** positions have been created at known times  
**When** I view the Position Desk table  
**Then** the Ingested At column shows a human-readable timestamp in the local timezone, and the full UTC ISO timestamp is available on hover  

**Priority:** P2  
**Linked components:** `TradeTable`, timestamp formatter  

### Test Cases
| # | Steps | Expected | Pass/Fail |
|---|-------|----------|-----------|
| TC-006-1 | Create a position. View the Ingested At column. | Timestamp visible in format `YYYY-MM-DD HH:MM` or similar human-readable form. Not raw epoch or ISO string. | |
| TC-006-2 | Hover over the Ingested At cell. | Tooltip shows full ISO 8601 UTC timestamp, e.g., `2026-02-24T14:32:00Z`. | |
| TC-006-3 | Change the browser timezone offset (DevTools > Sensors). Reload. | Displayed timestamp shifts to the new local timezone. UTC tooltip unchanged. | |
| TC-006-4 | Create a position near midnight. Verify correct date display. | No off-by-one from timezone conversion. Date is accurate. | |
| TC-006-5 | Check a position imported via CSV. Verify Ingested At reflects import time, not value_date. | Ingested At = server receipt time. Value Date = economic settlement date. Both must be distinct and correct. | |
| TC-006-6 | Sort table by Ingested At column. | Rows reorder chronologically. Both ascending and descending sort work. | |

---

## Story PD-007: Execution Status Column
**Given** positions have been submitted for execution  
**When** I view the Position Desk table  
**Then** the Execution Status column reflects the current IBKR execution lifecycle state with appropriate labels and colors  

**Priority:** P2  
**Linked components:** `TradeTable`, `executePositionThunk`, IBKR execution modal  

### Test Cases
| # | Steps | Expected | Pass/Fail |
|---|-------|----------|-----------|
| TC-007-1 | View a position that has never been executed. | Execution Status column shows a dash or PENDING in neutral color. | |
| TC-007-2 | Click Execute on a CONFIRMED position. Enter a valid IBKR reference. Confirm. | Execution Status updates to SUBMITTED or EXECUTED without page reload. | |
| TC-007-3 | Attempt to execute a FORECAST position. | Button disabled, or modal shows: "Only CONFIRMED positions can be executed." | |
| TC-007-4 | Attempt to execute a CONFIRMED position with a non-CME currency. | Modal shows: "Currency not eligible for automated hedging." Execution blocked. | |
| TC-007-5 | Attempt to execute the same position twice. | Second attempt blocked: "Position already executed." | |
| TC-007-6 | Verify the IBKR Reference field accepts alphanumeric strings and rejects empty values. | Empty reference blocked with: "IBKR Reference required." | |
| TC-007-7 | After execution, verify audit trail shows an EXECUTE event. | WORM audit entry created with timestamp, user attribution, and position reference. | |

---

## Story PD-008: Connection Hub Tab Ordering
**Given** I am on the Position Desk  
**When** I view the tab strip  
**Then** the tabs appear in the correct order: Manual Entry, Upload CSV / Excel, Connection Hub, Import History - and each tab activates its correct panel  

**Priority:** P3  
**Linked components:** `DESK_TABS` constant, tab strip renderer  

### Test Cases
| # | Steps | Expected | Pass/Fail |
|---|-------|----------|-----------|
| TC-008-1 | Navigate to `/input`. Observe the tab strip. | Tabs appear left-to-right: Manual Entry, Upload CSV / Excel, Connection Hub, Import History. | |
| TC-008-2 | Click Manual Entry. | Manual entry form panel is shown. Tab has active cyan underline. | |
| TC-008-3 | Click Upload CSV / Excel. | FileUploadLane panel is shown. Previous tab deactivates. | |
| TC-008-4 | Click Connection Hub. | Connection Hub panel with ERP/API/FTP connector cards is shown. | |
| TC-008-5 | Click Import History. | Import history / audit trail panel is shown. | |
| TC-008-6 | Use keyboard Tab and arrow keys to navigate the tab strip. | Focus moves between tabs. Enter activates the focused tab. | |
| TC-008-7 | Resize browser window to 768px width. | Tab strip scrolls horizontally. No tabs hidden or collapsed. | |

---

## Story PD-009: Audit Trail - WORM Events on Create
**Given** I create a new position as an authenticated real user  
**When** the position is saved  
**Then** an immutable WORM audit event is created with timestamp, user attribution, action type CREATE, and a tamper-evident hash chain entry  

**Priority:** P1 - Regulatory Blocking  
**Linked components:** Audit trail service, `positions` DB, `audit_events` table  
**Compliance note:** Required for SEC 17a-4 / CFTC 1.31 electronic recordkeeping compliance.  

### Test Cases
| # | Steps | Expected | Pass/Fail |
|---|-------|----------|-----------|
| TC-009-1 | Create a position. Query `audit_events` for `action = CREATE` and the `resource_id`. | Exactly one audit event row exists. | |
| TC-009-2 | Verify `audit_events.user_id` matches the authenticated user UUID. | User attribution correct. Not null, not "system", not another user ID. | |
| TC-009-3 | Verify `audit_events.timestamp` is within +-5 seconds of the save action time. | Timestamp is accurate and UTC. | |
| TC-009-4 | Verify `audit_events.payload` (JSON) contains the full field snapshot of the created position. | Record ID, entity, type, currency, amount, value_date, status, description all present. | |
| TC-009-5 | Attempt to UPDATE the audit event row via SQL to change the action field value. | Database constraint or application write-protection rejects the update. WORM enforced. | |
| TC-009-6 | Verify the hash chain: `audit_events.prev_hash` equals the hash of the previous event or genesis sentinel. | Hash chain is valid and unbroken. | |
| TC-009-7 | View the Import History / Audit Trail tab in the UI. | CREATE event visible with correct user name, timestamp, and action label. | |
| TC-009-8 | Export audit log to CSV from the UI (if feature exists). | Exported CSV contains the CREATE event row. Hash chain column present and populated. | |

---

## Story PD-010: Audit Trail - WORM Events on Update
**Given** an existing position  
**When** I edit and save changes  
**Then** an immutable WORM audit event is created for the UPDATE action with before/after field values and an unbroken hash chain  

**Priority:** P1 - Regulatory Blocking  
**Linked components:** Audit trail service, `updatePositionThunk`  

### Test Cases
| # | Steps | Expected | Pass/Fail |
|---|-------|----------|-----------|
| TC-010-1 | Edit a position AMOUNT field. Save. Query `audit_events` for `action = UPDATE` and this `resource_id`. | Exactly one new UPDATE event row exists. | |
| TC-010-2 | Verify `payload.before.amount` equals the old value and `payload.after.amount` equals the new value. | Field-level diff captured in the audit payload. | |
| TC-010-3 | Edit a position with no actual changes. Click Save. | No spurious UPDATE audit event is created (or one event with empty diff payload, per spec). | |
| TC-010-4 | Make three successive edits. Query audit table. | Three separate UPDATE events exist in chronological order. | |
| TC-010-5 | Verify `audit_events.user_id` on the UPDATE event matches the editor user ID, not the original creator. | Attribution reflects who made the change. | |
| TC-010-6 | Attempt to DELETE an UPDATE audit event row via SQL. | Rejected by WORM constraint. Event remains. | |
| TC-010-7 | Verify hash chain: UPDATE event `prev_hash` equals SHA-256 of the immediately preceding event. | Hash chain remains unbroken after update operation. | |

---

## Story PD-011: Audit Trail - WORM Events on Delete
**Given** an existing position  
**When** I delete it via the UI  
**Then** an immutable WORM audit event is created for the DELETE action; the position row is removed from the `positions` table but the audit event is permanent and the hash chain remains valid  

**Priority:** P1 - Regulatory Blocking  
**Linked components:** `deletePositionThunk`, audit trail service  

### Test Cases
| # | Steps | Expected | Pass/Fail |
|---|-------|----------|-----------|
| TC-011-1 | Click the delete icon on a position. Confirm deletion. | Position row disappears from the table. Toast: "Position deleted." | |
| TC-011-2 | Query `positions` table filtered by the deleted `record_id`. | Zero rows returned. Position data is removed from the table. | |
| TC-011-3 | Query `audit_events` for `action = DELETE` and this `resource_id`. | Exactly one DELETE event exists with the deleted position full field snapshot in payload. | |
| TC-011-4 | Attempt to delete the DELETE audit event row via SQL. | Rejected. WORM immutability enforced. | |
| TC-011-5 | Verify hash chain after deletion: DELETE event `prev_hash` equals hash of the previous event. | Hash chain valid. Deletion does not break the chain. | |
| TC-011-6 | Attempt to create a new position with the same `record_id` as the deleted one. | Either allowed or rejected per immutable-ID policy. Behavior must match documented spec; no silent errors. | |
| TC-011-7 | View the Import History / Audit Trail tab. | DELETE event visible with user name, timestamp, and the deleted record key fields. | |

---

## Story PD-012: CSV Import - Bulk Ingest
**Given** I have a correctly formatted CSV file with position data  
**When** I upload it via the Upload CSV / Excel tab  
**Then** all valid rows are imported, a success banner shows the count, and each imported position generates a CREATE audit event  

**Priority:** P1 - Blocking  
**Linked components:** FileUploadLane, importPositionsCsv, ImportBanner  

### Test Cases
| # | Steps | Expected | Pass/Fail |
|---|-------|----------|-----------|
| TC-012-1 | Upload a 10-row valid CSV. | Banner shows 10/10 rows imported. All 10 positions appear in the Manual Entry table. | |
| TC-012-2 | Upload a CSV with 5 valid rows and 2 rows with missing required fields. | Banner shows 5/7 rows imported with 2 errors. Error detail lists failing row numbers and missing fields. | |
| TC-012-3 | Upload a CSV with a duplicate record_id matching an existing DB record. | That row rejected. Error: Row N: record_id already exists. Other rows import normally. | |
| TC-012-4 | Upload an empty CSV (headers only, no data rows). | Banner shows 0/0 rows imported. No error. No crash. | |
| TC-012-5 | Upload a file with wrong extension (e.g., .pdf). | Upload rejected before transmission. Error: File type not supported. Please upload CSV or Excel. | |
| TC-012-6 | Upload a CSV with 1,000 rows (stress test). | All valid rows import without timeout. Backend processes within 30 seconds. | |
| TC-012-7 | After a 10-row import, query audit_events for CREATE events in the last minute. | Exactly 10 CREATE events, each attributed to the importing user, each with a distinct record_id. | |
| TC-012-8 | Verify ingested_at timestamps on all imported rows. | All rows share an ingested_at within the same import batch window. Not null. | |

---

## Story PD-013: IBKR Execution - Lifecycle Gate
**Given** I am viewing the Position Desk  
**When** I attempt to execute a position via IBKR  
**Then** the lifecycle gate enforces that only CONFIRMED positions with CME-eligible currencies can be submitted for execution  

**Priority:** P1 - Blocking  
**Linked components:** IBKR execution modal, executePositionThunk, openIbkrModal  

### Test Cases
| # | Steps | Expected | Pass/Fail |
|---|-------|----------|-----------|
| TC-013-1 | Click Execute on a CONFIRMED position with EUR currency. Enter IBKR ref. Confirm. | Execution succeeds. Status updates to EXECUTED. Audit event created. | |
| TC-013-2 | Click Execute on a FORECAST position. | Button disabled or modal shows: Only CONFIRMED positions are eligible for execution. | |
| TC-013-3 | Click Execute on a CONFIRMED position with a non-CME currency (e.g., EGP). | Modal shows: Currency EGP is not listed on CME or ICE. Automated hedging unavailable. | |
| TC-013-4 | Enter an empty IBKR Reference string. Click Confirm. | Validation fires: IBKR Reference is required. Submit disabled until populated. | |
| TC-013-5 | Submit execution, then attempt to execute the same position again. | Execute button disappears or is disabled. Error: Position already submitted for execution. | |
| TC-013-6 | Submit execution. Verify the execution_ref field on the position row in DB. | execution_ref persists in the DB and is displayed in the Execution Status column. | |
| TC-013-7 | Verify network payload on execution submit contains record_id, ibkr_ref, and Authorization header. | No plaintext credentials in the payload. | |
| TC-013-8 | Simulate backend timeout during execution (DevTools throttle to offline). | Toast shows: Execution request failed - please retry. No phantom EXECUTED status set on the row. | |

---

## Story PD-014: Demo Mode Isolation
**Given** I am viewing the app in demo mode (no authenticated user)  
**When** I interact with the Position Desk  
**Then** demo data is shown, all mutations are prevented, and no demo data leaks into the real database  

**Priority:** P1 - Data Integrity Blocking  
**Linked components:** useAuth, demo position seeder, positionSlice demo flag  

### Test Cases
| # | Steps | Expected | Pass/Fail |
|---|-------|----------|-----------|
| TC-014-1 | Open the app without logging in (or as a demo user). Navigate to /input. | Demo positions are shown. A Demo Mode banner or indicator is visible. | |
| TC-014-2 | Attempt to create a new position in demo mode. | Save button disabled, or the action completes locally without any DB write. | |
| TC-014-3 | Verify demo mode does not make authenticated API calls. | Network tab shows no POST/PATCH/DELETE to /api/positions with a real Bearer token. | |
| TC-014-4 | In demo mode, delete a position. Reload the page. | Demo data is restored from seed. The deleted position reappears. No permanent change. | |
| TC-014-5 | Query the positions table in PostgreSQL during a demo session. | No demo-labeled rows are inserted. Real DB is untouched. | |
| TC-014-6 | Check audit_events table after extensive demo interaction. | No audit events created by demo mode operations. WORM log is clean. | |
| TC-014-7 | Switch from demo mode to authenticated mode (log in). | Demo positions disappear. Real DB positions load. No cross-contamination. | |

---

## Story PD-015: No Demo Data - Real User Session
**Given** I am authenticated as a real user with no saved positions  
**When** I navigate to the Position Desk  
**Then** the table shows the empty state component, no demo data is injected, and the interface prompts me to create my first position  

**Priority:** P1 - Data Integrity Blocking  
**Linked components:** EmptyState, listPositionsThunk, positionSlice  

### Test Cases
| # | Steps | Expected | Pass/Fail |
|---|-------|----------|-----------|
| TC-015-1 | Log in as a real user with zero positions. Navigate to /input. | Table shows EmptyState component with a Create your first position CTA. No demo rows visible. | |
| TC-015-2 | Verify no API call to a demo seed endpoint is made. | Network tab shows only GET /api/positions returning an empty array for the authenticated user. | |
| TC-015-3 | Verify that DEMO_DATA constants are not rendered in the real-user DOM. | Inspect HTML. No position rows with known demo record IDs (e.g., DEMO-001). | |
| TC-015-4 | Create one real position. Reload. | Only the one real position appears. No demo data injected alongside it. | |
| TC-015-5 | Log out, log back in. Verify session isolation. | No data from the previous session local state persists. Fresh load from DB only. | |
| TC-015-6 | Log in as User A (no positions) and User B (5 positions) in separate browser sessions. | User A sees empty state. Per-user data isolation enforced. User A cannot see User B positions. | |
| TC-015-7 | In DevTools, manually dispatch addLocalPosition with a demo payload. Reload. | Local state is polluted for this session only. Reload restores clean DB-backed list. Backend was not written to. | |

---

## Appendix A: Regression Checklist

Run after every merge to sprint-1.9-page-upgrades:

- [ ] All 15 stories re-executed on staging environment
- [ ] WORM stories (PD-009, PD-010, PD-011) countersigned by Compliance liaison
- [ ] Zero errors in browser console during any test execution
- [ ] TypeScript build passes: npx tsc --noEmit returns exit code 0
- [ ] No demo data appears in real-user sessions (PD-015)

## Appendix B: Test Environment

| Parameter | Value |
|-----------|-------|
| Browser | Chrome 122+ (primary), Firefox 123+, Safari 17+ |
| Resolution | 1440x900 minimum, also test at 1280x800 and 1920x1080 |
| Backend | Staging API at https://api-staging.synexiun.internal |
| DB | PostgreSQL 15, staging schema, seeded with fixture data |
| Auth | Real JWT tokens; demo mode via unauthenticated route |
| Network | Normal, then throttled to Slow 3G for timeout tests |

## Appendix C: Regulatory References

| Standard | Requirement | Covered By |
|----------|-------------|------------|
| SEC Rule 17a-4 | Electronic records must be preserved in WORM format | PD-009, PD-010, PD-011 |
| CFTC Rule 1.31 | Audit trail must be tamper-evident and retrievable | PD-009, PD-010, PD-011 |
| GDPR Art. 5(1)(f) | User data must not cross-contaminate between users | PD-014, PD-015 |
| ISO 8601 | Date formats in financial records | PD-001, PD-004 |
| Basel III Op Risk | Operational controls for trade entry and modification | PD-003, PD-013 |
