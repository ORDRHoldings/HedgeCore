"""POST /api/v1/calculate -- main pipeline endpoint.



Pipe & Filter: Validate -> Normalize -> Kernel -> Scenarios -> Audit -> Persist -> Response

Fail-closed: any CRITICAL validation error returns 422.



Phase 0: Every run is now persisted to the calculation_runs table (DB-backed).

The in-memory _run_store is kept as a fast cache (bounded to 50 items) but

every run also lands in the DB for permanence, replay, and audit chain.



Sprint 1.0: Every run now pins the active policy_revision_id + policy_hash so

the exact policy governing the calculation is provable for audit/replay.

"""



import hashlib
import json as _json
import logging
import uuid
from collections import defaultdict
from time import time as _time

_log = logging.getLogger(__name__)

from datetime import UTC, datetime

# Per-user rate limiter for POST /v1/calculate (10 req/min)

_CALC_RATE_LIMIT = 10

_CALC_RATE_WINDOW = 60.0

_calc_timestamps: dict = defaultdict(list)



def _check_calc_rate(user_id: str) -> bool:

    now = _time()

    _calc_timestamps[user_id] = [t for t in _calc_timestamps[user_id] if now - t < _CALC_RATE_WINDOW]

    if len(_calc_timestamps[user_id]) >= _CALC_RATE_LIMIT:

        return False

    _calc_timestamps[user_id].append(now)

    return True



# SEC-04: Distributed rate limiter (Redis-backed with in-memory fallback)
import os as _os

from app.core.rate_limiter import RateLimiter as _RateLimiter

_distributed_rate_limiter = _RateLimiter(
    redis_url=_os.getenv("REDIS_URL"),
    max_requests=_CALC_RATE_LIMIT,
    window_seconds=int(_CALC_RATE_WINDOW),
)

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.schema_state import require_schema_ready
from app.core.dependencies import get_current_user
from app.engine_v1.audit import build_run_envelope, build_trace_lite
from app.engine_v1.kernel import compute_hedge_plan
from app.engine_v1.normalizer import normalize_hedges, normalize_trades
from app.engine_v1.scenarios import compute_scenarios
from app.engine_v1.validator import validate_all
from app.models.calculation_run import CalculationRun
from app.models.position import Position
from app.models.user import User
from app.schemas_v1.hedges import HedgeRow
from app.schemas_v1.market import MarketSnapshot
from app.schemas_v1.policy import PolicyConfig
from app.schemas_v1.results import (
    CalculateRequest,
    CalculateResponse,
    TraceEvent,
)
from app.schemas_v1.trades import TradeRow
from app.services import rbac_service
from app.services.market_snapshot_service import (
    create_or_get as _snapshot_create_or_get,
)
from app.services.market_snapshot_service import (
    get_by_id as _snapshot_get_by_id,
)

router = APIRouter(prefix="/v1", tags=["v1-calculate"])


async def _fire_webhook(company_id, endpoint_id, event_type: str, data: dict) -> None:
    """Open a fresh DB session for webhook delivery (background task)."""
    from app.core.db import async_session_maker
    from app.models.webhook import WebhookEndpoint as _WE
    from app.services.webhook_service import dispatch_webhook_event as _dispatch
    from sqlalchemy import select as _sel
    async with async_session_maker() as session:
        result = await session.execute(_sel(_WE).where(_WE.id == endpoint_id))
        ep = result.scalar_one_or_none()
        if ep:
            await _dispatch(session, ep, event_type, data)


# In-memory cache (bounded to 50 items) -- supplements DB persistence for fast access

_run_store: dict[str, CalculateResponse] = {}





def get_run(run_id: str) -> CalculateResponse | None:

    return _run_store.get(run_id)  # Legacy helper — use compound key in API routes





# ?? Response schema for run list ??????????????????????????????????????????????



class RunSummary(BaseModel):

    run_id:       str

    inputs_hash:  str

    outputs_hash: str

    run_hash:     str

    trade_count:  int

    hedge_count:  int

    created_at:   str





class RunListResponse(BaseModel):

    items: list[RunSummary]

    total: int





# ?? Persist helper ????????????????????????????????????????????????????????????


async def _resolve_position_ids(
    session: AsyncSession,
    user: User | None,
    trades: list[TradeRow],
) -> list[str]:
    """Resolve trade record_ids to Position UUIDs for the run's position_ids field."""
    if not user or not trades:
        return []
    try:
        record_ids = [t.record_id for t in trades]
        q = (
            select(Position.id, Position.record_id)
            .where(Position.company_id == user.company_id)
            .where(Position.record_id.in_(record_ids))
        )
        rows = list((await session.execute(q)).all())
        return [str(row.id) for row in rows]
    except Exception:
        return []


async def _persist_run(

    session: AsyncSession,

    response: CalculateResponse,

    user: User | None,

    trades: list[TradeRow],

) -> None:

    """

    Write the run to calculation_runs. Non-fatal: if DB write fails, the

    calculation result is still returned (we log the failure but don't surface it).

    The in-memory cache already has the result.



    Sprint 1.0: Pins the active policy_revision_id + policy_hash onto the run row

    so the exact policy config governing this calculation is provable for audit/replay.

    """

    from app.services.policy_revision_service import get_latest_revision
    from app.services.policy_service import get_active_instance



    envelope = response.run_envelope



    # Resolve active policy revision for this user (non-fatal)

    pinned_revision_id: str | None = None

    pinned_policy_hash: str | None = None

    if user:

        try:

            active_instance = await get_active_instance(session, user)

            if active_instance:

                latest_rev = await get_latest_revision(session, active_instance.id)

                if latest_rev:

                    pinned_revision_id = str(latest_rev.id)

                    pinned_policy_hash = latest_rev.policy_hash

        except Exception:

            _log.warning(

                "Failed to resolve active policy revision for run %s. "

                "policy_revision_id will be NULL for this run.",

                response.run_id, exc_info=True,

            )



    run_row = CalculationRun(

        id                 = response.run_id,

        company_id         = user.company_id if user else None,

        user_id            = user.id         if user else None,

        inputs_hash        = envelope.inputs_hash,

        outputs_hash       = envelope.outputs_hash,

        run_hash           = envelope.run_hash,

        position_ids       = await _resolve_position_ids(session, user, trades),

        run_envelope       = {

            # BUG-1 fix: persist hash chain + outputs so committee pack can read hedge_plan

            **envelope.model_dump(mode="json"),

            "hedge_plan":       response.hedge_plan.model_dump(mode="json") if response.hedge_plan else None,

            "scenario_results": response.scenario_results.model_dump(mode="json") if response.scenario_results else None,

        },

        trace_lite         = response.trace_lite.model_dump(mode="json") if response.trace_lite else None,

        trade_count        = len(trades),

        hedge_count        = len(response.hedge_plan.buckets) if response.hedge_plan else 0,

        policy_revision_id = pinned_revision_id,   # Sprint 1.0: pinned revision UUID

        policy_hash        = pinned_policy_hash,   # Sprint 1.0: SHA-256 of canonical config

    )

    session.add(run_row)

    await session.commit()





# ?? POST /v1/calculate ????????????????????????????????????????????????????????



@router.post("/calculate", response_model=CalculateResponse)

async def calculate(

    request: CalculateRequest,

    background_tasks: BackgroundTasks,

    session: AsyncSession     = Depends(get_async_session),

    current_user: User        = Depends(get_current_user),

    _schema: None             = Depends(require_schema_ready),

):

    # Per-user rate limit: max 10 calculations per minute

    # RBAC: require calculate.run_production permission

    if not current_user.is_superuser:

        perms = await rbac_service.get_permissions_by_user(session, current_user.id)

        if "calculate.run_production" not in perms:

            raise HTTPException(status_code=403, detail="Missing permission: calculate.run_production")



    if not _distributed_rate_limiter.is_allowed(f"calc:{current_user.id}"):

        raise HTTPException(

            status_code=429,

            detail="Rate limit exceeded: max 10 calculations per minute per user. Please wait before retrying.",

        )



    run_id = str(uuid.uuid4())

    trace_events: list[TraceEvent] = []



    # --- Step 0: Parse raw dicts into Pydantic models ---

    try:

        trades = [TradeRow(**t) if isinstance(t, dict) else t for t in request.trades]

    except ValidationError as e:

        raise HTTPException(status_code=422, detail={"parse_error": "trades", "errors": e.errors()})



    try:

        hedges = [HedgeRow(**h) if isinstance(h, dict) else h for h in request.hedges]

    except ValidationError as e:

        raise HTTPException(status_code=422, detail={"parse_error": "hedges", "errors": e.errors()})



    # ── Market: load from WORM store when snapshot_id provided, else use embedded ──
    _snapshot_meta: dict | None = None
    if request.market_snapshot_id:
        import uuid as _req_uuid
        try:
            _snap_uuid = _req_uuid.UUID(request.market_snapshot_id)
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid market_snapshot_id format")
        _snap = await _snapshot_get_by_id(session, _snap_uuid, current_user.company_id)
        if not _snap:
            raise HTTPException(
                status_code=404,
                detail=f"MarketSnapshot {request.market_snapshot_id!r} not found or not accessible",
            )
        try:
            market = MarketSnapshot(**_snap.payload) if isinstance(_snap.payload, dict) else _snap.payload
        except ValidationError as e:
            raise HTTPException(status_code=422, detail={"parse_error": "market_snapshot", "errors": e.errors()})
        _snapshot_meta = {
            "market_snapshot_id":          str(_snap.id),
            "market_snapshot_hash":        _snap.market_snapshot_hash,
            "market_provider":             _snap.provider,
            "market_fetched_at":           _snap.fetched_at.isoformat(),
            "market_as_of":                _snap.as_of.isoformat(),
            "market_data_class":           _snap.data_class,
            "market_is_synthetic_forward": _snap.is_synthetic_forward,
        }
        trace_events.append(
            TraceEvent(
                step="MARKET_SNAPSHOT_LOAD",
                timestamp=datetime.now(UTC),
                detail=f"Loaded market snapshot {request.market_snapshot_id[:12]}... hash={_snap.market_snapshot_hash[:16]}... provider={_snap.provider}",
            )
        )
    else:
        try:
            market = MarketSnapshot(**request.market) if isinstance(request.market, dict) else request.market
        except ValidationError as e:
            raise HTTPException(status_code=422, detail={"parse_error": "market", "errors": e.errors()})
        # Auto-persist snapshot to WORM store (non-fatal — calculation proceeds regardless)
        try:
            _auto_snap = await _snapshot_create_or_get(session, current_user, request.market)
            _snapshot_meta = {
                "market_snapshot_id":          str(_auto_snap.id),
                "market_snapshot_hash":        _auto_snap.market_snapshot_hash,
                "market_provider":             _auto_snap.provider,
                "market_fetched_at":           _auto_snap.fetched_at.isoformat(),
                "market_as_of":                _auto_snap.as_of.isoformat(),
                "market_data_class":           _auto_snap.data_class,
                "market_is_synthetic_forward": _auto_snap.is_synthetic_forward,
            }
        except Exception:
            _log.warning("Failed to auto-persist market snapshot for run %s", run_id, exc_info=True)



    try:

        policy = PolicyConfig(**request.policy) if isinstance(request.policy, dict) else request.policy

    except ValidationError as e:

        raise HTTPException(status_code=422, detail={"parse_error": "policy", "errors": e.errors()})



    trace_events.append(

        TraceEvent(step="PARSE", timestamp=datetime.now(UTC), detail="Input parsing complete.")

    )



    # --- Step 1: Validate (fail-closed) ---

    report = validate_all(trades, hedges, market, policy)

    trace_events.append(

        TraceEvent(

            step="VALIDATE",

            timestamp=datetime.now(UTC),

            detail=f"Validation {report.status}. Errors: {len(report.errors)}, Warnings: {len(report.warnings)}.",

        )

    )



    if report.status == "FAIL":

        raise HTTPException(

            status_code=422,

            detail={"validation_report": report.model_dump(mode="json")},

        )



    # --- Step 2: Normalize ---

    trades_df = normalize_trades(trades)

    hedges_df = normalize_hedges(hedges)

    trace_events.append(

        TraceEvent(

            step="NORMALIZE",

            timestamp=datetime.now(UTC),

            detail=f"Normalized {len(trades_df)} trades, {len(hedges_df)} hedges.",

        )

    )



    # --- Step 3: Kernel ---

    hedge_plan, kernel_traces = compute_hedge_plan(trades_df, hedges_df, market, policy)

    trace_events.extend(kernel_traces)

    trace_events.append(

        TraceEvent(

            step="KERNEL",

            timestamp=datetime.now(UTC),

            detail=f"Hedge plan computed: {len(hedge_plan.buckets)} buckets.",

        )

    )



    # --- Step 4: Scenarios ---

    scenario_results = compute_scenarios(hedge_plan.buckets, market)

    trace_events.append(

        TraceEvent(

            step="SCENARIO",

            timestamp=datetime.now(UTC),

            detail=f"Scenarios computed: {len(scenario_results.sigmas)} shocks x {len(hedge_plan.buckets)} buckets.",

        )

    )



    # --- Step 5: Audit + RunEnvelope ---

    trades_raw   = [t.model_dump(mode="json") for t in trades]

    hedges_raw   = [h.model_dump(mode="json") for h in hedges]

    market_raw   = market.model_dump(mode="json")

    policy_raw   = policy.model_dump(mode="json")

    outputs_raw  = {

        "hedge_plan":       hedge_plan.model_dump(mode="json"),

        "scenario_results": scenario_results.model_dump(mode="json"),

    }



    run_envelope = build_run_envelope(
        run_id=run_id,
        trades_raw=trades_raw,
        hedges_raw=hedges_raw,
        market_raw=market_raw,
        policy_raw=policy_raw,
        outputs_raw=outputs_raw,
        snapshot_meta=_snapshot_meta,
    )



    trace_events.append(

        TraceEvent(

            step="AUDIT",

            timestamp=datetime.now(UTC),

            detail=f"RunEnvelope built. inputs_hash={run_envelope.inputs_hash[:16]}... run_hash={run_envelope.run_hash[:16]}...",

        )

    )



    # --- Step 5b: Market data source fingerprint ---

    _market_canonical = _json.dumps(market_raw, sort_keys=True, separators=(",", ":"), ensure_ascii=False)

    _market_hash = hashlib.sha256(_market_canonical.encode("utf-8")).hexdigest()

    trace_events.append(

        TraceEvent(

            step="MARKET_SOURCE",

            timestamp=datetime.now(UTC),

            detail=f"Market data: source=client, snapshot_hash={_market_hash[:16]}..., spot_count={len(market_raw.get('rates', market_raw.get('spots', {})) or {})}"

        )

    )



    trace_lite = build_trace_lite(run_id, trace_events)



    # --- Assemble response ---

    response = CalculateResponse(

        run_id=run_id,

        validation_report=report,

        hedge_plan=hedge_plan,

        scenario_results=scenario_results,

        run_envelope=run_envelope,

        trace_lite=trace_lite,

    )



    # --- Step 6: Persist to DB (non-fatal) ---

    try:

        await _persist_run(session, response, current_user, trades)

    except Exception:

        # DB write failure is logged but never surfaces to the caller.

        # The in-memory cache still has the result for immediate use.

        import logging

        logging.getLogger(__name__).warning(

            f"Failed to persist run {run_id} to DB -- result still returned to caller",

            exc_info=True,

        )



    # --- Step 6b: Eagerly attach TCA estimate to this run (non-fatal) ---

    try:

        from app.services.tca_service import attach_to_calc_run as _tca_attach

        _hedge_actions = (

            [b.model_dump(mode="json") for b in hedge_plan.buckets]

            if hedge_plan else []

        )

        _market_snapshot_id = None

        if _snapshot_meta and _snapshot_meta.get("market_snapshot_id"):

            import uuid as _tca_uuid

            try:

                _market_snapshot_id = _tca_uuid.UUID(_snapshot_meta["market_snapshot_id"])

            except (ValueError, TypeError):

                _market_snapshot_id = None

        if _market_snapshot_id is not None:

            await _tca_attach(

                db=session,

                calculation_run_id=run_id,

                tenant_id=current_user.company_id,

                user_id=current_user.id,

                hedge_actions=_hedge_actions,

                slippage_estimates=[],

                market=market_raw,

                policy=policy_raw,

                market_snapshot_id=_market_snapshot_id,

            )

    except Exception:

        import logging

        logging.getLogger(__name__).warning(

            "TCA attach failed for run %s", run_id, exc_info=True,

        )



    # --- Step 7: Emit audit events (non-fatal) ---

    try:

        from app.models.audit_event import GENESIS_HASH as _GENESIS_HASH
        from app.models.audit_event import AuditEvent as _AuditEvent
        from app.models.audit_event import build_audit_event as _build_audit_event

        # Resolve previous hash for chain (per-tenant)

        _prev_q = (

            select(_AuditEvent.event_hash)

            .where(_AuditEvent.company_id == current_user.company_id)

            .order_by(_AuditEvent.created_at.desc())

            .limit(1)

        )

        _prev_result = await session.execute(_prev_q)

        _prev_hash = _prev_result.scalars().first() or _GENESIS_HASH

        # First audit event: calculation run completed

        _calc_event = _build_audit_event(

            event_type      = "CALCULATE",

            description     = f"Calculation run completed: run_id={run_id}",

            payload         = {

                "run_id":       run_id,

                "inputs_hash":  run_envelope.inputs_hash,

                "outputs_hash": run_envelope.outputs_hash,

                "run_hash":     run_envelope.run_hash,

                "trade_count":  len(trades),

                "hedge_count":  len(response.hedge_plan.buckets) if response.hedge_plan else 0,

            },

            prev_event_hash = _prev_hash,

            company_id      = current_user.company_id,

            branch_id       = current_user.branch_id,

            actor_id        = current_user.id,

            actor_email     = current_user.email,

            entity_type     = "calculation_run",

            entity_id       = run_id,

        )

        session.add(_calc_event)

        await session.flush()

        # Second audit event: market data source fingerprint (L-02)

        _market_source_hash = _market_hash

        _market_event = _build_audit_event(

            event_type      = "CALCULATE",

            description     = f"Market data: source=client, hash={_market_source_hash[:16]}...",

            payload         = {

                "market_source":          "client",

                "market_snapshot_hash":   _market_source_hash,

                "run_id":                 run_id,

                "data_age_note":          "Market data provided by client at calculation time",

            },

            prev_event_hash = _calc_event.event_hash,

            company_id      = current_user.company_id,

            branch_id       = current_user.branch_id,

            actor_id        = current_user.id,

            actor_email     = current_user.email,

            entity_type     = "calculation_run",

            entity_id       = run_id,

        )

        session.add(_market_event)

        await session.commit()

    except Exception:

        _log.warning(

            "Failed to emit audit events for run %s -- result still returned to caller",

            run_id,

            exc_info=True,

        )

    # Update in-memory cache (fast lookup for export endpoints)

    _run_store[f"{current_user.company_id}:{run_id}"] = response

    if len(_run_store) > 50:

        oldest = next(iter(_run_store))

        del _run_store[oldest]

    # Webhook dispatch: calculation.completed
    try:
        from sqlalchemy import select as _wh_calc_select
        from app.models.webhook import WebhookEndpoint as _WH_Endpoint
        _wh_calc_result = await session.execute(
            _wh_calc_select(_WH_Endpoint)
            .where(_WH_Endpoint.company_id == current_user.company_id)
            .where(_WH_Endpoint.is_active.is_(True))
        )
        for _wh_ep in _wh_calc_result.scalars().all():
            if _wh_ep.subscribes_to("calculation.completed"):
                background_tasks.add_task(
                    _fire_webhook, current_user.company_id, _wh_ep.id, "calculation.completed",
                    {"run_id": run_id, "position_count": len(trades)},
                )
    except Exception:
        _log.warning("Failed to dispatch calculation.completed webhook for run %s", run_id, exc_info=True)

    return response





# ?? GET /v1/runs -- list persisted runs ???????????????????????????????????????



@router.get("/runs", response_model=RunListResponse)

async def list_runs(

    limit:        int           = Query(default=50, le=200, ge=1),

    session:      AsyncSession  = Depends(get_async_session),

    current_user: User          = Depends(get_current_user),

):

    """

    List calculation runs for the caller's company (or all runs for superusers).

    Returns summary rows (no JSONB payloads) for list rendering.

    """

    q = select(CalculationRun).order_by(CalculationRun.created_at.desc()).limit(limit)

    if current_user and not current_user.is_superuser and current_user.company_id:

        q = q.where(CalculationRun.company_id == current_user.company_id)

    rows = list((await session.execute(q)).scalars().all())



    items = [

        RunSummary(

            run_id       = r.id,

            inputs_hash  = r.inputs_hash,

            outputs_hash = r.outputs_hash,

            run_hash     = r.run_hash,

            trade_count  = r.trade_count,

            hedge_count  = r.hedge_count,

            created_at   = r.created_at.isoformat() if r.created_at else "",

        )

        for r in rows

    ]

    return {"items": items, "total": len(items)}





# ?? GET /v1/runs/{run_id} -- fetch full run detail ????????????????????????????



@router.get("/runs/{run_id}")

async def get_run_detail(

    run_id:       str,

    session:      AsyncSession  = Depends(get_async_session),

    current_user: User          = Depends(get_current_user),

):

    """

    Fetch a single run by ID. Returns the full RunEnvelope + TraceLite JSONB.

    Fast path: checks in-memory cache first, then DB.

    Used for: run replay, audit drill-down, export.

    """

    # Fast path: in-memory cache (with tenant isolation)
    cached = _run_store.get(f"{current_user.company_id}:{run_id}")
    if cached:
        # Even on cache hit, verify tenant via DB (P0: prevents cross-tenant leaks).
        # Superusers bypass; non-superusers whose run row is in DB must match company_id.
        if not current_user.is_superuser:
            row = await session.get(CalculationRun, run_id)
            if row is not None and row.company_id and row.company_id != current_user.company_id:
                raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
        return cached



    # DB lookup

    row = await session.get(CalculationRun, run_id)

    if not row:

        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")



    # Tenant check

    if (

        current_user

        and not current_user.is_superuser

        and row.company_id

        and row.company_id != current_user.company_id

    ):

        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")



    return {

        "run_id":             row.id,

        "run_envelope":       row.run_envelope,

        "trace_lite":         row.trace_lite,

        "trade_count":        row.trade_count,

        "hedge_count":        row.hedge_count,

        "inputs_hash":        row.inputs_hash,

        "outputs_hash":       row.outputs_hash,

        "run_hash":           row.run_hash,

        "policy_revision_id": row.policy_revision_id,   # BUG-2 fix: Sprint 1.0 policy pin

        "policy_hash":        row.policy_hash,           # BUG-2 fix: Sprint 1.0 policy pin

        "created_at":         row.created_at.isoformat() if row.created_at else None,

    }


# ── POST /v1/calculate/extended ───────────────────────────────────────────────
# API-01: Runs the standard calculate pipeline PLUS all engine_v1 extended
# modules (factor covariance, margin, liquidity, NAV attribution, TCA, rolls,
# capital adequacy, waterfall).  Reuses the exact same auth/RBAC/rate-limit
# guards as the standard endpoint.
# Returns ExtendedCalculateResponse: { base: CalculateResponse, extended: {...} }


from app.schemas_v1.extended_response import ExtendedCalculateResponse


@router.post("/calculate/extended", response_model=ExtendedCalculateResponse)
async def calculate_extended(
    request_data: "CalculateRequest",
    session: AsyncSession = Depends(get_async_session),
    current_user: "User" = Depends(get_current_user),
    _schema: None = Depends(require_schema_ready),
):
    """Extended calculation: standard pipeline + all engine_v1 analytical modules.

    Identical auth, RBAC, and rate-limit guards as POST /v1/calculate.
    All extended modules are non-fatal -- failures are captured as None.
    """
    from fastapi.background import BackgroundTasks as _BgTasks
    base_result = await calculate(
        request=request_data,
        background_tasks=_BgTasks(),
        session=session,
        current_user=current_user,
        _schema=None,
    )

    # Extract plan buckets from the base result for extended modules
    hedge_plan = base_result.hedge_plan
    buckets_raw = [b.model_dump(mode="json") for b in hedge_plan.buckets] if hedge_plan else []
    market_raw = request_data.market if isinstance(request_data.market, dict) else {}
    policy_raw = request_data.policy if isinstance(request_data.policy, dict) else {}

    extended: dict = {}

    # Margin model
    try:
        from app.engine_v1.margin_model import compute_margin
        if buckets_raw:
            margin_result = compute_margin(buckets_raw, market_raw, policy_raw)
            extended["margin"] = margin_result.to_dict()
        else:
            extended["margin"] = None
    except Exception as _e:
        extended["margin"] = None
        _log.warning("margin extended module failed: %s", _e)

    # Concentration limits
    try:
        from app.engine_v1.concentration_limits import check_concentration_limits
        if buckets_raw:
            conc_result = check_concentration_limits(buckets_raw, policy_raw)
            extended["concentration"] = conc_result.to_dict()
        else:
            extended["concentration"] = None
    except Exception as _e:
        extended["concentration"] = None
        _log.warning("concentration extended module failed: %s", _e)

    # Hedge effectiveness (dollar-offset on current run)
    try:
        from app.engine_v1.hedge_accounting import assess_hedge_effectiveness_dollar_offset
        if buckets_raw:
            hedged_changes = [b.get("commercial_exposure_mxn", 0.0) for b in buckets_raw]
            instrument_changes = [b.get("hedge_position_mxn", 0.0) for b in buckets_raw]
            eff_result = assess_hedge_effectiveness_dollar_offset(hedged_changes, instrument_changes)
            extended["hedge_effectiveness"] = eff_result.to_dict()
        else:
            extended["hedge_effectiveness"] = None
    except Exception as _e:
        extended["hedge_effectiveness"] = None
        _log.warning("hedge_effectiveness extended module failed: %s", _e)

    # Factor covariance
    try:
        from app.engine_v1.factor_covariance import build_factor_covariance_matrix
        ccy_set = set()
        for t in (request_data.trades or []):
            ccy = t.get("currency", "MXN") if isinstance(t, dict) else getattr(t, "currency", "MXN")
            ccy_set.add(ccy)
        if ccy_set:
            import pandas as pd
            cov = build_factor_covariance_matrix(pd.Index(sorted(ccy_set)))
            extended["factor_covariance"] = cov.to_dict() if hasattr(cov, "to_dict") else None
        else:
            extended["factor_covariance"] = None
    except Exception as _e:
        extended["factor_covariance"] = None
        _log.warning("factor_covariance extended module failed: %s", _e)

    # Capital adequacy
    try:
        from app.engine_v1.capital_adequacy import compute_capital_charges
        extended["capital"] = compute_capital_charges(buckets_raw) if buckets_raw else None
    except Exception as _e:
        extended["capital"] = None
        _log.warning("capital extended module failed: %s", _e)

    # Waterfall
    try:
        from app.engine_v1.waterfall import compute_waterfall
        extended["waterfall"] = compute_waterfall(buckets_raw) if buckets_raw else None
    except Exception as _e:
        extended["waterfall"] = None
        _log.warning("waterfall extended module failed: %s", _e)

    return ExtendedCalculateResponse(base=base_result, extended=extended)

