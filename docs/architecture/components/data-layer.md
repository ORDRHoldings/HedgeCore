# Data models and persistence

## Purpose
Define the database schema and persistence patterns for governance,
policy revisions, audit logs, and user management.

## Responsibilities
- SQLAlchemy models and migrations
- Session management and database lifecycle
- Governance ledger and audit storage

## Key files
- `backend/app/models`
- `backend/app/db`
- `backend/app/core/db.py`

## Interfaces
- CRUD services in `backend/app/services`
- Pipeline services for SANDBOX/STAGING/LEDGER transitions

## Failure modes
- Migration mismatch can corrupt historical audit data
- Incorrect session handling can leak connections
