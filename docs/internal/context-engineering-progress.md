# Context engineering progress

## Purpose
Track ongoing documentation, architecture, and integration updates across
multiple chats.

## Current goals
- Establish ADR and component documentation baseline
- Capture integration workflows for key user flows

## Decisions log
- 2026-03-04: Added ADRs for FastAPI, deterministic engine, and pipeline.

## Files added or changed
- `docs/adr/0001-fastapi-asgi-api.md`
- `docs/adr/0002-deterministic-engine.md`
- `docs/adr/0003-tri-state-governance-pipeline.md`
- `docs/components/overview.md`
- `docs/components/backend-api.md`
- `docs/components/hedge-engine.md`
- `docs/components/data-layer.md`
- `docs/components/frontend-app.md`
- `docs/components/infra-and-deploy.md`
- `docs/integrations/overview.md`
- `docs/integrations/auth-and-access.md`
- `docs/integrations/hedge-calc-flow.md`
- `docs/integrations/governance-pipeline.md`
- `docs/integrations/reporting-exports.md`

## Open questions
- Are there any external systems or brokers to document explicitly?
- Which workflows require diagrams or sequence charts?

## Next steps
- Add ADRs for data retention and audit policies
- Expand component docs with config details and env vars
