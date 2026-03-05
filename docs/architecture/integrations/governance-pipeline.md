# Governance pipeline flow

## Actors
- Risk analyst
- Supervisor approver
- Ledger/audit system

## Component diagram
```mermaid
flowchart LR
  UI[UI Client] --> API[FastAPI API]
  API --> PIPE[Pipeline Service]
  PIPE --> SANDBOX[Sandbox Run Store]
  PIPE --> DB[(Postgres)]
  DB --> AUDIT[Audit Events]
  PIPE --> ENGINE[Engine v1]
  ENGINE --> EXPORTS[Exports v1]
  API --> AUTH[Auth/RBAC]
```

## Sequence diagram
```mermaid
sequenceDiagram
  autonumber
  participant User as Risk Analyst
  participant UI as UI Client
  participant API as FastAPI API
  participant PIPE as Pipeline Service
  participant ENG as Engine v1
  participant DB as Postgres
  participant AUD as Audit Events

  User->>UI: Run sandbox calculation
  UI->>API: POST /v1/pipeline/sandbox/calculate
  API->>PIPE: sandbox_calculate(request)
  PIPE->>ENG: compute plan + scenarios
  ENG-->>PIPE: results + trace
  PIPE-->>API: sandbox response
  API-->>UI: return results

  User->>UI: Create proposal
  UI->>API: POST /v1/pipeline/proposals
  API->>PIPE: create_proposal()
  PIPE->>DB: persist proposal
  PIPE->>AUD: record lifecycle event
  API-->>UI: proposal id

  User->>UI: Submit to staging
  UI->>API: POST /v1/pipeline/staging
  API->>PIPE: submit_to_staging()
  PIPE->>DB: persist staged artifact
  PIPE->>AUD: record lifecycle event
  API-->>UI: staging id

  User->>UI: Approve
  UI->>API: POST /v1/pipeline/authorize
  API->>PIPE: authorize()
  PIPE->>DB: create ledger entry
  PIPE->>AUD: record lifecycle event
  API-->>UI: ledger id
```

## Steps
1. Analyst runs SANDBOX calculations and saves proposals.
2. Items move to STAGING for review and approval.
3. Approved items are committed to LEDGER.
4. Audit logs and policy revisions are recorded.

## Key endpoints
- `/v1/pipeline/*`
- `/v1/proposals/*`
- `/v1/policies/revisions/*`
- `/v1/audit/*`

## Notes
- Use SANDBOX for experimentation; LEDGER is immutable.
