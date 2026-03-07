# API Contracts

## Authentication
| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/auth/register` | POST | None | Create user |
| `/auth/login` | POST | None | Get JWT tokens |
| `/auth/refresh` | POST | Refresh token | Refresh access token |
| `/auth/me` | GET | JWT | Current user info |

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

## Audit
| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/v1/audit` | GET | JWT | Query audit events |
| `/v1/audit/chain/verify` | GET | JWT | Verify hash chain integrity |

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
