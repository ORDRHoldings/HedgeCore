# Backend Rules

## Route Pattern
```python
@router.get("/endpoint", response_model=ResponseSchema)
async def endpoint(
    request: Request,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
```
- Always use `get_current_user` from `app.core.dependencies`.
- Always check RBAC permissions before business logic.
- Return Pydantic response models, never raw dicts.

## Database
- Use `selectinload` for eager loading relationships on User model.
- `lazy="raise"` on User.branch/company — always eager-load in `_resolve_user()`.
- Async sessions only (`AsyncSession` from `app.core.db`).
- No raw SQL in route handlers — use SQLAlchemy ORM.

## Auth Dependencies
- `get_current_user` — standard JWT auth (from `app.core.dependencies`)
- `require_superuser` — superuser-only endpoints (from `app.core.dependencies`)
- `get_api_key_principal` — API key auth (from `app.deps.api_key_auth`)
- Never create new auth dependencies without updating `dependencies.py`.

## Position Lifecycle
- States: NEW -> POLICY_ASSIGNED -> READY_TO_EXECUTE -> HEDGED | REJECTED
- Transitions enforced in `position_service.py`.
- `ExecutionProposal.hedge_amount` does NOT exist as column — it's in `proposal_payload` JSONB.

## Governance
- Tri-State Pipeline: SANDBOX -> STAGING -> LEDGER
- 4-eyes approval: maker/checker with Separation of Duties
- SoD blocks same user from both making and checking a proposal.

## Testing
- `requires_postgres` marker auto-skips DB tests on SQLite.
- Test command: `JWT_SECRET="..." DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/`
- `risk_allocator` treats `margin_budget=0` as unconstrained (falsy -> inf).
