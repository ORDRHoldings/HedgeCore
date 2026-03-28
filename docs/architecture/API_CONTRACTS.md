# API Contracts

## Authentication
| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/auth/register` | POST | None | Create user |
| `/auth/login` | POST | None | Get JWT tokens |
| `/auth/refresh` | POST | Refresh token | Refresh access token |
| `/auth/me` | GET | JWT | Current user info |
| `/auth/sso/callback` | POST | None | WorkOS SSO callback — exchanges WorkOS `code` for ORDR JWT; creates or retrieves user by SSO profile |

## Self-Service Signup
| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/v1/signup` | POST | None | Atomic tenant provisioning — creates Company + admin User + GENESIS audit event; 409 on duplicate email |

## Billing
| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/v1/billing/webhook` | POST | Stripe-signature | Stripe webhook receiver — handles `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`; validates `Stripe-Signature` header before processing |

## Dashboard
| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/v1/dashboard/summary` | GET | JWT | KPIs (exposure, coverage, proposals, alerts) |
| `/v1/dashboard/recent-runs` | GET | JWT | Last 10 proposals (returns `id` key) |
| `/v1/dashboard/pending-approvals` | GET | JWT | Staging queue |
| `/v1/dashboard/team-activity` | GET | JWT | Audit feed |
| `/v1/dashboard/aggregate` | GET | JWT | All-in-one (summary+runs+approvals) |

## Positions
| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/v1/positions` | GET | JWT | List positions |
| `/v1/positions` | POST | JWT | Create position |
| `/v1/positions/{id}` | GET | JWT | Get position |
| `/v1/positions/{id}` | PATCH | JWT | Update position |
| `/v1/positions/exposure` | GET | JWT | Currency exposure aggregation |

## Calculation
| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/v1/calculate` | POST | JWT | Run hedge calculation |
| `/v1/runs` | GET | JWT | List calculation runs (returns `run_id` key) |
| `/v1/runs/{id}` | GET | JWT | Get calculation run |

## Policies
| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/v1/policies/templates` | GET | JWT | List policy templates |
| `/v1/policies/active` | GET | JWT | Current active policy |
| `/v1/policies/activate` | POST | JWT | Activate a policy |
| `/v1/policies/revisions` | GET | JWT | Revision history (WORM) |

## Pipeline
| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/v1/pipeline/sandbox` | POST | JWT | Create sandbox run |
| `/v1/pipeline/proposals` | GET/POST | JWT | Manage proposals |
| `/v1/pipeline/staging` | GET/POST | JWT | Staging operations |
| `/v1/pipeline/ledger` | GET | JWT | Ledger entries (WORM) |

## Execution
| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/v1/proposals` | GET/POST | JWT | Execution proposals (4-eyes) |
| `/v1/proposals/{id}/approve` | POST | JWT | Checker approval (SoD) |
| `/v1/proposals/{id}/reject` | POST | JWT | Checker rejection |

## Audit (Governance)
| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/v1/audit` | GET | JWT | Query audit events |
| `/v1/audit/chain/verify` | GET | JWT | Verify hash chain integrity |

## Audit Lab
| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/v1/audit-lab/datasets/upload` | POST | JWT | Upload CSV, create dataset + parse rows |
| `/v1/audit-lab/datasets` | GET | JWT | List datasets |
| `/v1/audit-lab/runs` | POST | JWT | Create audit run (engine analysis) |
| `/v1/audit-lab/runs` | GET | JWT | List audit runs |
| `/v1/audit-lab/runs/{run_id}` | GET | JWT | Get run detail (stats, findings, transactions) |
| `/v1/audit-lab/runs/{run_id}/export` | GET | JWT | Export run (board summary / evidence binder / xlsx) |
| `/v1/audit-lab/runs/{run_id}/transactions` | GET | JWT | Paginated transaction rows for a run |
| `/v1/audit-lab/runs/{run_id}/exposure-gaps` | GET | JWT | Currency exposure gap analysis |
| `/v1/audit-lab/compare` | GET | JWT | Compare two runs side-by-side |
| `/v1/audit-lab/trends` | GET | JWT | Markup trend data across runs |
| `/v1/audit-lab/audit-trail` | GET | JWT | Immutable activity log for audit lab actions |
| `/v1/audit-lab/review-queue` | GET | JWT | Transactions flagged for manual review |
| `/v1/audit-lab/review-queue/{transaction_id}/resolve` | POST | JWT | Resolve a review-queue item |
| `/v1/audit-lab/schedules` | POST | JWT | Create recurring audit schedule |
| `/v1/audit-lab/schedules` | GET | JWT | List audit schedules |

## Reports
| Endpoint | Method | Auth | Perm | Returns | Notes |
|----------|--------|------|------|---------|-------|
| `/v1/reports/{run_id}/emir` | GET | JWT | reports.export | application/xml | EMIR trade report XML |
| `/v1/reports/{run_id}/mifid` | GET | JWT | reports.export | application/xml | MiFID II transaction report XML |
| `/v1/reports/{run_id}/dodd-frank` | GET | JWT | reports.export | application/xml | Dodd-Frank swap data report XML |
| `/v1/reports/{run_id}/isda` | GET | JWT | reports.export | application/xml | ISDA trade confirmation XML; transaction list built from hedge_plan.buckets in run_envelope |
| `/v1/reports/{run_id}/finra-17a4` | GET | JWT | reports.export | text/plain | FINRA 17a-4 pipe-delimited with SHA-256 hash chain; findings derived from audit_flags in run_envelope; hash chain from recent audit events |

## Hedge Effectiveness
| Endpoint | Method | Auth | Perm | Returns | Notes |
|----------|--------|------|------|---------|-------|
| `/v1/hedge-effectiveness/runs/{run_id}/ifrs9-xml` | GET | JWT | reports.export | application/xml | IFRS 9 hedge effectiveness evidence XML; includes dollar-offset ratio, regression stats, per-period data, and audit hashes |
| `/v1/hedge-effectiveness/runs/{run_id}/asc815-xml` | GET | JWT | reports.export | application/xml | ASC 815 hedge effectiveness evidence XML; same structure as ifrs9-xml with standard label overridden to ASC_815 |

## Admin
| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/v1/admin/roles` | GET/POST | JWT+RBAC | Role management |
| `/v1/admin/users` | GET/POST | JWT+superuser | User management |
| `/v1/admin/monitor/*` | GET | JWT+superuser | System monitoring (6 endpoints) |

## Key Contract Notes
- `GET /v1/runs` returns `run_id` key; `GET /v1/dashboard/recent-runs` returns `id` — both are the same UUID.
- `ExecutionProposal.hedge_amount` is in `proposal_payload` JSONB, not a top-level column.
- All mutation endpoints require CSRF token (X-CSRF-Token header) unless using Bearer JWT.
- WORM endpoints never accept PUT/PATCH/DELETE.
