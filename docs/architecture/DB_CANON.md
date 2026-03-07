# Database Canon

## Schema Overview

Tables are created via two mechanisms:
- **DDL in main.py**: 35 tables created on startup
- **SQLAlchemy models + Alembic**: additional tables via metadata

### Organization Hierarchy (3 tables, DDL)
| Table | PK | Purpose |
|-------|-----|---------|
| `companies` | UUID | Multi-tenant root entity |
| `branches` | UUID | Company subdivisions |
| `departments` | UUID | Branch subdivisions |

### Users & Auth (10 tables)
| Table | Source | PK | Purpose | WORM |
|-------|--------|-----|---------|------|
| `users` | DDL | UUID | User accounts (email, bcrypt hash, company/branch/dept FKs) | No |
| `roles` | DDL | UUID | RBAC roles (9 seeded) | No |
| `permissions` | DDL | UUID | RBAC permissions (41 seeded) | No |
| `user_roles` | DDL | composite | User-role assignments | No |
| `role_permissions` | DDL | composite | Role-permission assignments | No |
| `refresh_tokens` | DDL | UUID | JWT refresh tokens | No |
| `user_mfa` | DDL | UUID | MFA configuration | No |
| `api_keys` | Model | UUID | API keys (HK_live_ prefix, bcrypt secret) | No |
| `auth_audit_logs` | Model | UUID | Auth event log | Yes |
| `api_key_audit_logs` | Model | UUID | API key usage log | Yes |

### Business Data (6 tables)
| Table | Source | PK | Purpose | WORM |
|-------|--------|-----|---------|------|
| `positions` | DDL | UUID | FX exposures (lifecycle state machine) | No |
| `policy_templates` | DDL | UUID | Policy definitions (20 system templates) | No |
| `policy_instances` | DDL | UUID | Active policy instances | No |
| `user_policy_favorites` | DDL | UUID | User policy favorites | No |
| `policy_revisions` | DDL | UUID | Immutable policy history | YES |
| `calculation_runs` | DDL | UUID | Engine output snapshots | YES |

### Governance Pipeline (6 tables)
| Table | Source | PK | Purpose | WORM |
|-------|--------|-----|---------|------|
| `proposals` | Model | UUID | Governance proposals | No |
| `staging_artifacts` | Model | UUID | Staging queue items | No |
| `approvals` | Model | UUID | Approval records | No |
| `ledger_entries` | Model | UUID | Committed ledger (immutable) | YES |
| `anchor_hashes` | Model | UUID | Ledger anchor hashes | Yes |
| `execution_proposals` | DDL | UUID | 4-eyes maker/checker proposals | No |

### Connectors & Import (3 tables)
| Table | Source | PK | Purpose | WORM |
|-------|--------|-----|---------|------|
| `connector_runs` | DDL | UUID | Import run records | No |
| `connector_run_errors` | DDL | UUID | Import error details | No |
| `market_snapshots` | DDL | UUID | Saved market data snapshots | No |

### Audit (2 tables, DDL)
| Table | PK | Purpose | WORM |
|-------|-----|---------|------|
| `audit_events` | UUID | Hash-chained audit trail | YES |

### Reporting & Support (4 tables, DDL)
| Table | PK | Purpose | WORM |
|-------|-----|---------|------|
| `saved_reports` | UUID | Saved report definitions | No |
| `report_schedules` | UUID | Report scheduling | No |
| `support_tickets` | UUID | Support ticket tracking | No |
| `ticket_events` | UUID | Support ticket events | No |

### Audit Lab (5 tables, DDL)
| Table | PK | Purpose | WORM |
|-------|-----|---------|------|
| `audit_datasets` | UUID | Audit Lab datasets | YES |
| `audit_transactions` | UUID | Audit Lab transactions | YES |
| `audit_runs` | UUID | Audit Lab analysis runs | YES |
| `audit_findings` | UUID | Audit Lab findings | YES |
| `audit_reports` | UUID | Audit Lab reports | YES |

### Decision Desk (3 tables, DDL)
| Table | PK | Purpose | WORM |
|-------|-----|---------|------|
| `decision_runs` | UUID | Decision Desk runs | YES |
| `decision_proposals` | UUID | Decision Desk proposals | YES |
| `execution_packets` | UUID | Execution packets | YES |

### Hedge Effectiveness (2 tables, DDL)
| Table | PK | Purpose | WORM |
|-------|-----|---------|------|
| `hedge_effectiveness_datasets` | UUID | Effectiveness test data | YES |
| `hedge_effectiveness_runs` | UUID | Effectiveness test results | YES |

## WORM Enforcement
- NO_UPDATE + NO_DELETE triggers on all WORM tables (23 trigger references in main.py).
- Hash chain: SHA-256, per-tenant, GENESIS_HASH = `0000000000000000000000000000000000000000000000000000000000000000`.
- `audit_events.is_intact` verified via `/v1/audit/chain/verify`.

## Current Production State
- Company: DemoCo (id: 11111111-1111-1111-1111-111111111111)
- Governance mode: team
- Demo user: demo/demo (admin, is_superuser=true)

## Connection
- Production: `postgresql+asyncpg://hedge_user@<RENDER_HOST>/hedge` (see env vars)
- CI: `sqlite+aiosqlite:///:memory:`
- Local psql: see `CLAUDE.md` for path
