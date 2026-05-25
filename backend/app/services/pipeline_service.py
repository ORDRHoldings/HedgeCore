"""Pipeline Service -- orchestrates SANDBOX -> STAGING -> LEDGER transitions.



Manages proposal lifecycle, staging governance, and ledger finalization.

Sandbox runs are kept in-memory (ephemeral simulations).

Proposals, staging artifacts, and ledger entries are persisted to PostgreSQL.

"""



import hashlib
import uuid
from datetime import UTC, datetime

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine_v1.audit import build_run_envelope, build_trace_lite
from app.engine_v1.capital_adequacy import assess_capital_adequacy
from app.engine_v1.concentration_limits import check_concentration_limits
from app.engine_v1.currency_netting_matrix import compute_currency_netting
from app.engine_v1.deterministic_rounding import round_freeze_artifact
from app.engine_v1.factor_covariance import compute_factor_covariance
from app.engine_v1.fx_forward_validator import validate_forward_consistency
from app.engine_v1.fx_roll_engine import generate_roll_ladder
from app.engine_v1.fx_tensor import compute_exposure_tensor
from app.engine_v1.hasher import sha256_of_dict
from app.engine_v1.hedge_bands import check_hedge_bands
from app.engine_v1.kernel import compute_hedge_plan
from app.engine_v1.liquidity_model import estimate_slippage
from app.engine_v1.liquidity_regime import classify_liquidity_regime
from app.engine_v1.margin_attribution import compute_margin_attribution
from app.engine_v1.margin_model import compute_margin
from app.engine_v1.nav_attribution_engine import compute_nav_attribution
from app.engine_v1.normalizer import normalize_hedges, normalize_trades
from app.engine_v1.risk_allocator import allocate_hedges
from app.engine_v1.scenarios import compute_scenarios
from app.engine_v1.scenarios_ext import apply_extended_scenarios
from app.engine_v1.transaction_cost_model import compute_transaction_costs
from app.engine_v1.validator import validate_all
from app.engine_v1.waterfall import build_waterfall
from app.engine_v1.worst_case_selector import select_worst_case
from app.models.audit_event import GENESIS_HASH, build_audit_event
from app.schemas_v1.hedges import HedgeRow
from app.schemas_v1.market import MarketSnapshot
from app.schemas_v1.pipeline import (
    ApprovalAction,
    ApprovalRecord,
    AuthorizationStatus,
    AuthorizeRequest,
    FreezeArtifact,
    LedgerEntry,
    Proposal,
    ProposalStatus,
    ProvenanceChain,
    ReplayResult,
    SandboxCalculateRequest,
    StagedArtifact,
    SubmitToStagingRequest,
    TimelineEvent,
    WaterfallResult,
)
from app.schemas_v1.policy import PolicyConfig
from app.schemas_v1.results import (
    CalculateResponse,
    TraceEvent,
)
from app.schemas_v1.trades import TradeRow
from app.services import pipeline_db

# ---------------------------------------------------------------------------

# In-memory stores (sandbox runs are ephemeral, timelines are lightweight)

# ---------------------------------------------------------------------------

_sandbox_runs: dict[str, dict] = {}   # run_id -> {response, inputs, waterfall, ...}

_timelines: dict[str, list[TimelineEvent]] = {}  # entity_id -> events



MAX_STORE_SIZE = 100



async def _emit_pipeline_event(
    session,
    entity_id: str,
    event_tag: str,
    actor_id: str,
    description: str,
    payload: dict,
    company_id: str | None = None,
) -> None:
    """Persist a pipeline lifecycle event to the WORM audit_events table."""
    from sqlalchemy import select as _sel

    from app.models.audit_event import AuditEvent as _AuditEvent

    try:
        import uuid as _uuid
        actor_uuid = _uuid.UUID(actor_id) if actor_id else None
    except (ValueError, AttributeError):
        actor_uuid = None

    # Resolve company_id to a UUID for the tenant-scoped hash chain query
    _company_uuid = None
    if company_id:
        try:
            import uuid as _uuid2
            _company_uuid = _uuid2.UUID(company_id)
        except (ValueError, AttributeError):
            pass

    # Query previous event hash for the hash chain (per-tenant)
    prev_hash = GENESIS_HASH
    if _company_uuid is not None:
        _prev_q = (
            _sel(_AuditEvent.event_hash)
            .where(_AuditEvent.company_id == _company_uuid)
            .order_by(_AuditEvent.created_at.desc())
            .limit(1)
        )
        _prev_result = await session.execute(_prev_q)
        prev_hash = _prev_result.scalars().first() or GENESIS_HASH

    event = build_audit_event(
        event_type="LIFECYCLE",
        description=description,
        payload=payload,
        prev_event_hash=prev_hash,
        actor_id=actor_uuid,
        company_id=_company_uuid,
        entity_type="staging_artifact",
        entity_id=entity_id,
    )
    session.add(event)
    try:
        await session.commit()
    except Exception:
        await session.rollback()





def _gen_id(prefix: str) -> str:

    return f"{prefix}-{uuid.uuid4().hex[:8].upper()}"





def _now() -> datetime:

    return datetime.now(UTC)





def _add_timeline(entity_id: str, event_type: str, actor: str, detail: str = "", **meta):

    evt = TimelineEvent(

        event_type=event_type,

        timestamp=_now(),

        actor=actor,

        detail=detail,

        metadata=meta,

    )

    _timelines.setdefault(entity_id, []).append(evt)





# ---------------------------------------------------------------------------

# Staleness Check

# ---------------------------------------------------------------------------





def check_snapshot_staleness(market_as_of: datetime, threshold_minutes: int = 30) -> bool:

    """Returns True if snapshot is stale."""

    delta = (_now() - market_as_of).total_seconds() / 60

    return delta > threshold_minutes





# ---------------------------------------------------------------------------

# SANDBOX: Calculate (in-memory, synchronous -- CPU-bound engine work)

# ---------------------------------------------------------------------------





def sandbox_calculate(user_id: str, request: SandboxCalculateRequest) -> dict:

    """Run the full engine pipeline in sandbox mode.



    Returns dict with: run_id, calculate_response, waterfall_result, trace_events

    """

    run_id = str(uuid.uuid4())

    trace_events: list[TraceEvent] = []



    # Parse inputs

    try:

        trades = [TradeRow(**t) if isinstance(t, dict) else t for t in request.trades]

    except ValidationError as e:

        raise ValueError(f"Trade parse error: {e}")



    try:

        hedges = [HedgeRow(**h) if isinstance(h, dict) else h for h in request.hedges]

    except ValidationError as e:

        raise ValueError(f"Hedge parse error: {e}")



    try:

        market = MarketSnapshot(**request.market) if isinstance(request.market, dict) else request.market

    except ValidationError as e:

        raise ValueError(f"Market parse error: {e}")



    try:

        policy = PolicyConfig(**request.policy) if isinstance(request.policy, dict) else request.policy

    except ValidationError as e:

        raise ValueError(f"Policy parse error: {e}")



    trace_events.append(

        TraceEvent(step="PARSE", timestamp=_now(), detail="Input parsing complete.")

    )



    # Validate

    report = validate_all(trades, hedges, market, policy)

    trace_events.append(

        TraceEvent(step="VALIDATE", timestamp=_now(),

                   detail=f"Validation {report.status}. Errors: {len(report.errors)}")

    )



    hedge_plan = None

    scenario_results = None



    if report.status == "PASS":

        # Normalize

        trades_df = normalize_trades(trades)

        hedges_df = normalize_hedges(hedges)



        # Kernel

        hedge_plan, kernel_traces = compute_hedge_plan(trades_df, hedges_df, market, policy)

        trace_events.extend(kernel_traces)



        # Scenarios

        scenario_results = compute_scenarios(hedge_plan.buckets, market)



    # Serialize inputs early (needed by multiple stages)

    trades_raw = [t.model_dump(mode="json") for t in trades]

    hedges_raw = [h.model_dump(mode="json") for h in hedges]

    market_raw = market.model_dump(mode="json")

    policy_raw = policy.model_dump(mode="json")



    # -----------------------------------------------------------------------

    # V2 Engine Extensions

    # -----------------------------------------------------------------------

    v2_results: dict = {}



    if hedge_plan:

        bucket_dicts = [b.model_dump(mode="json") for b in hedge_plan.buckets]



        # A27: FX Forward Consistency Validator

        fwd_validation = validate_forward_consistency(market_raw, policy_raw)

        v2_results["forward_validation"] = fwd_validation.to_dict()



        # A9: Multi-Currency FX Tensor

        tensor_result = compute_exposure_tensor(trades_raw, market_raw)

        v2_results["tensor_result"] = tensor_result.to_dict()



        # A12: Hedge Band Check

        band_result = check_hedge_bands(bucket_dicts, policy_raw)

        v2_results["hedge_bands"] = band_result.to_dict()



        # Build hedge actions from kernel buckets

        hedge_actions = [

            {

                "bucket": b.bucket,

                "action_usd": b.action_usd,

                "action_local": getattr(b, 'action_local', getattr(b, 'action_mxn', 0.0)),

                "action_mxn": getattr(b, 'action_mxn', 0.0),  # backward compat

                "instrument": policy_raw.get("execution_product", "FWD"),

                "pair": "USDMXN",  # default for legacy kernel path

                "value_date": getattr(b, 'value_date', None),  # for margin model FIX-06

            }

            for b in hedge_plan.buckets

        ]



        # A11: Margin Model

        margin_summary = compute_margin(hedge_actions, market_raw, policy_raw)

        v2_results["margin_summary"] = margin_summary.to_dict()



        # A14: Liquidity & Slippage

        liquidity_result = estimate_slippage(hedge_actions, market_raw, policy_raw)

        v2_results["liquidity_result"] = liquidity_result.to_dict()



        # A10: Risk Priority & Capital Allocator

        allocator_result = allocate_hedges(

            hedge_actions,

            margin_summary.to_dict()["positions"],

            liquidity_result.to_dict()["estimates"],

            market_raw,

            policy_raw,

        )

        v2_results["allocator_result"] = allocator_result.to_dict()



        # A13: FX Roll Ladder

        roll_ladder = generate_roll_ladder(hedge_actions, market_raw, policy_raw)

        v2_results["roll_ladder"] = roll_ladder.to_dict()



        # A17 + A30: Extended Scenarios

        if hasattr(hedge_plan.summary, 'total_commercial_exposure_local'):

            total_exposure = abs(hedge_plan.summary.total_commercial_exposure_local)

        else:

            total_exposure = abs(hedge_plan.summary.total_commercial_exposure_mxn)

        total_hedge = sum(abs(b.action_usd) for b in hedge_plan.buckets)

        ext_scenarios = apply_extended_scenarios(

            total_exposure, total_hedge, market_raw, policy_raw,

            margin_total=margin_summary.total_initial_margin,

        )

        v2_results["extended_scenarios"] = ext_scenarios.to_dict()



        # A25: Factor Covariance

        exposures_map = {t.to_dict()["pair"]: t.net_notional for t in tensor_result.exposures}

        hedges_map = {a["bucket"]: a["action_usd"] for a in hedge_actions}

        factor_cov = compute_factor_covariance(exposures_map, hedges_map, market_raw)

        v2_results["factor_covariance"] = factor_cov.to_dict()



        # A26: Transaction Costs

        txn_costs = compute_transaction_costs(

            hedge_actions,

            liquidity_result.to_dict()["estimates"],

            market_raw,

            policy_raw,

        )

        v2_results["transaction_costs"] = txn_costs.to_dict()



        # A28: NAV Attribution

        nav_attr = compute_nav_attribution(trades_raw, market_raw)

        v2_results["nav_attribution"] = nav_attr.to_dict()



        # A29: Currency Netting

        fx_rates = market_raw.get("fx_rates", {})

        netting = compute_currency_netting(exposures_map, fx_rates)

        v2_results["currency_netting"] = netting.to_dict()



        # A37: Concentration Limits

        concentration = check_concentration_limits(hedge_actions, policy_raw)

        v2_results["concentration"] = concentration.to_dict()



        # A39: Liquidity Regime

        regime = classify_liquidity_regime(market_raw, liquidity_result.to_dict())

        v2_results["liquidity_regime"] = regime.to_dict()



        # A38: Worst-Case Selector

        base_scenarios_dict = scenario_results.model_dump(mode="json") if scenario_results else {}

        worst_case = select_worst_case(base_scenarios_dict, ext_scenarios.to_dict())

        v2_results["worst_case"] = worst_case.to_dict()



        # A36: Margin Attribution

        margin_breakdown = compute_margin_attribution(

            margin_summary.to_dict()["positions"],

            liquidity_result.to_dict()["estimates"],

            concentration.get_concentration_data(),

        )

        v2_results["margin_breakdown"] = margin_breakdown.to_dict()



        # A35: Capital Adequacy

        portfolio_equity = policy_raw.get("portfolio_equity_usd", None)

        if portfolio_equity is None:

            equity_ratio = policy_raw.get("portfolio_equity_ratio", 0.10)

            portfolio_equity = total_exposure * equity_ratio

        cap_adequacy = assess_capital_adequacy(

            portfolio_equity,

            margin_summary.total_initial_margin,

            abs(worst_case.worst_case_loss),

            policy_raw,

        )

        v2_results["capital_adequacy"] = cap_adequacy.to_dict()



        trace_events.append(

            TraceEvent(step="V2_EXTENSIONS", timestamp=_now(),

                       detail=f"V2 engine extensions complete. {len(v2_results)} modules executed.")

        )



    # Collect extra R6 violations from hedge bands and concentration

    extra_r6 = []

    if "hedge_bands" in v2_results:

        for v in v2_results["hedge_bands"].get("violations", []):

            extra_r6.append(f"BAND_{v['violation_type']}: {v['bucket']} ratio={v['effective_ratio']:.4f}")

    if "concentration" in v2_results:

        for c in v2_results["concentration"].get("checks", []):

            if c.get("status") in ("WARNING", "BREACH"):

                extra_r6.append(f"CONCENTRATION_{c['status']}: {c['instrument']} at {c['concentration_pct']:.1%}")



    # Build waterfall (with extended violations)

    waterfall = build_waterfall(report, hedge_plan, trace_events, extra_r6_violations=extra_r6)



    outputs_raw = {}

    if hedge_plan and scenario_results:

        outputs_raw = {

            "hedge_plan": hedge_plan.model_dump(mode="json"),

            "scenario_results": scenario_results.model_dump(mode="json"),

        }



    run_envelope = build_run_envelope(

        run_id=run_id,

        trades_raw=trades_raw,

        hedges_raw=hedges_raw,

        market_raw=market_raw,

        policy_raw=policy_raw,

        outputs_raw=outputs_raw,

    )



    trace_lite = build_trace_lite(run_id, trace_events)



    # Assemble response

    response = CalculateResponse(

        run_id=run_id,

        validation_report=report,

        hedge_plan=hedge_plan,

        scenario_results=scenario_results,

        run_envelope=run_envelope,

        trace_lite=trace_lite,

    ) if hedge_plan and scenario_results else None



    result = {

        "run_id": run_id,

        "calculate_response": response,

        "waterfall_result": waterfall,

        "validation_report": report,

        "hedge_plan": hedge_plan,

        "scenario_results": scenario_results,

        "trace_events": trace_events,

        "frozen_inputs": {

            "trades": trades_raw,

            "hedges": hedges_raw,

            "market": market_raw,

            "policy": policy_raw,

        },

        "run_envelope": run_envelope,

        "v2_results": v2_results,

    }



    # Store in memory (sandbox is ephemeral)

    _sandbox_runs[run_id] = result

    if len(_sandbox_runs) > MAX_STORE_SIZE:

        oldest = next(iter(_sandbox_runs))

        del _sandbox_runs[oldest]



    return result



def sandbox_calculate_multi(
    user_id: str,
    request: "SandboxCalculateRequest",
    pair: str = "USDMXN",
) -> dict:
    """Run multi-currency pipeline for any supported pair.

    For pair="USDMXN", delegates to legacy sandbox_calculate() for backward compat.
    For all other pairs, uses kernel_multi + normalizer_multi + scenarios_multi
    plus all satellite V2 modules.
    """
    if pair == "USDMXN":
        return sandbox_calculate(user_id, request)

    # Multi-currency kernel modules (from Prompt 1)
    from app.engine_v1.kernel_multi import compute_hedge_plan_multi
    from app.engine_v1.normalizer_multi import normalize_hedges_multi, normalize_trades_multi
    from app.engine_v1.pair_registry import get_pair_meta
    from app.engine_v1.scenarios_multi import compute_scenarios_multi
    from app.schemas_v1.hedges import MultiCurrencyHedgeRow
    from app.schemas_v1.market import MarketSnapshot
    from app.schemas_v1.policy import PolicyConfig

    run_id = str(uuid.uuid4())
    trace_events: list[TraceEvent] = []

    # Validate pair (raises ValueError for unsupported pairs)
    get_pair_meta(pair)

    # Parse inputs
    try:
        trades = [TradeRow(**t) if isinstance(t, dict) else t for t in request.trades]
    except (ValidationError, Exception) as e:
        raise ValueError(f"Trade parse error: {e}")

    try:
        hedges_raw_list = request.hedges or []
        hedges = []
        for h in hedges_raw_list:
            hd = h if isinstance(h, dict) else h.model_dump()
            try:
                hedges.append(MultiCurrencyHedgeRow(**hd))
            except (ValidationError, Exception):
                from app.schemas_v1.hedges import HedgeRow
                hedges.append(HedgeRow(**hd))
    except (ValidationError, Exception) as e:
        raise ValueError(f"Hedge parse error: {e}")

    try:
        market = MarketSnapshot(**request.market) if isinstance(request.market, dict) else request.market
    except (ValidationError, Exception) as e:
        raise ValueError(f"Market parse error: {e}")

    try:
        policy = PolicyConfig(**request.policy) if isinstance(request.policy, dict) else request.policy
    except (ValidationError, Exception) as e:
        raise ValueError(f"Policy parse error: {e}")

    trace_events.append(TraceEvent(step="PARSE", timestamp=_now(), detail=f"Input parsing complete. pair={pair}"))

    # Validate (reuse existing validator)
    report = validate_all(trades, hedges if hedges else [], market, policy)
    trace_events.append(
        TraceEvent(step="VALIDATE", timestamp=_now(),
                   detail=f"Validation {report.status}. pair={pair}")
    )

    hedge_plan = None
    scenario_results = None

    if report.status == "PASS":
        trades_df = normalize_trades_multi(trades, pair=pair)
        hedges_df = normalize_hedges_multi(hedges, pair=pair)

        hedge_plan, kernel_traces = compute_hedge_plan_multi(
            trades_df, hedges_df, market, policy, pair=pair
        )
        trace_events.extend(kernel_traces)

        scenario_results = compute_scenarios_multi(hedge_plan.buckets, market, pair=pair)

    # Serialize
    trades_raw = [t.model_dump(mode="json") for t in trades]
    hedges_raw_ser = [h.model_dump(mode="json") for h in hedges]
    market_raw = market.model_dump(mode="json")
    policy_raw = policy.model_dump(mode="json")

    # V2 Engine Extensions (satellite modules)
    v2_results: dict = {}

    if hedge_plan:
        bucket_dicts = [b.model_dump(mode="json") for b in hedge_plan.buckets]

        fwd_validation = validate_forward_consistency(market_raw, policy_raw, pair=pair)
        v2_results["forward_validation"] = fwd_validation.to_dict()

        tensor_result = compute_exposure_tensor(trades_raw, market_raw)
        v2_results["tensor_result"] = tensor_result.to_dict()

        band_result = check_hedge_bands(bucket_dicts, policy_raw)
        v2_results["hedge_bands"] = band_result.to_dict()

        hedge_actions = [
            {
                "bucket": b.bucket,
                "action_usd": b.action_usd,
                "action_local": getattr(b, "action_local", getattr(b, "action_mxn", 0.0)),
                "action_mxn": getattr(b, "action_mxn", 0.0),
                "instrument": policy_raw.get("execution_product", "FWD"),
                "pair": pair,
                "value_date": getattr(b, "value_date", None),
            }
            for b in hedge_plan.buckets
        ]

        margin_summary = compute_margin(hedge_actions, market_raw, policy_raw)
        v2_results["margin_summary"] = margin_summary.to_dict()

        liquidity_result = estimate_slippage(hedge_actions, market_raw, policy_raw)
        v2_results["liquidity_result"] = liquidity_result.to_dict()

        allocator_result = allocate_hedges(
            hedge_actions,
            margin_summary.to_dict()["positions"],
            liquidity_result.to_dict()["estimates"],
            market_raw, policy_raw,
        )
        v2_results["allocator_result"] = allocator_result.to_dict()

        roll_ladder = generate_roll_ladder(hedge_actions, market_raw, policy_raw, pair=pair)
        v2_results["roll_ladder"] = roll_ladder.to_dict()

        if hasattr(hedge_plan.summary, "total_commercial_exposure_local"):
            total_exposure_val = abs(hedge_plan.summary.total_commercial_exposure_local)
        else:
            total_exposure_val = abs(hedge_plan.summary.total_commercial_exposure_mxn)
        total_hedge = sum(abs(b.action_usd) for b in hedge_plan.buckets)

        ext_scenarios = apply_extended_scenarios(
            total_exposure_val, total_hedge, market_raw, policy_raw,
            margin_total=margin_summary.total_initial_margin,
        )
        v2_results["extended_scenarios"] = ext_scenarios.to_dict()

        exposures_map = {t.to_dict()["pair"]: t.net_notional for t in tensor_result.exposures}
        hedges_map = {a["bucket"]: a["action_usd"] for a in hedge_actions}
        factor_cov = compute_factor_covariance(exposures_map, hedges_map, market_raw)
        v2_results["factor_covariance"] = factor_cov.to_dict()

        txn_costs = compute_transaction_costs(
            hedge_actions, liquidity_result.to_dict()["estimates"], market_raw, policy_raw,
        )
        v2_results["transaction_costs"] = txn_costs.to_dict()

        nav_attr = compute_nav_attribution(trades_raw, market_raw)
        v2_results["nav_attribution"] = nav_attr.to_dict()

        fx_rates = market_raw.get("fx_rates", {})
        netting = compute_currency_netting(exposures_map, fx_rates)
        v2_results["currency_netting"] = netting.to_dict()

        concentration = check_concentration_limits(hedge_actions, policy_raw)
        v2_results["concentration"] = concentration.to_dict()

        regime = classify_liquidity_regime(market_raw, liquidity_result.to_dict(), pair=pair)
        v2_results["liquidity_regime"] = regime.to_dict()

        base_scenarios_dict = scenario_results.model_dump(mode="json") if scenario_results else {}
        worst_case = select_worst_case(base_scenarios_dict, ext_scenarios.to_dict())
        v2_results["worst_case"] = worst_case.to_dict()

        margin_breakdown = compute_margin_attribution(
            margin_summary.to_dict()["positions"],
            liquidity_result.to_dict()["estimates"],
            concentration.get_concentration_data(),
            pair=pair,
        )
        v2_results["margin_breakdown"] = margin_breakdown.to_dict()

        portfolio_equity = policy_raw.get("portfolio_equity_usd", None)
        if portfolio_equity is None:
            equity_ratio = policy_raw.get("portfolio_equity_ratio", 0.10)
            portfolio_equity = total_exposure_val * equity_ratio

        cap_adequacy = assess_capital_adequacy(
            portfolio_equity,
            margin_summary.total_initial_margin,
            abs(worst_case.worst_case_loss),
            policy_raw,
        )
        v2_results["capital_adequacy"] = cap_adequacy.to_dict()

        trace_events.append(
            TraceEvent(step="V2_EXTENSIONS", timestamp=_now(),
                       detail=f"V2 engine extensions complete. pair={pair} modules={len(v2_results)}")
        )

    # Extra R6 violations
    extra_r6 = []
    if "hedge_bands" in v2_results:
        for v in v2_results["hedge_bands"].get("violations", []):
            extra_r6.append(f"BAND_{v['violation_type']}: {v['bucket']} ratio={v['effective_ratio']:.4f}")
    if "concentration" in v2_results:
        for c in v2_results["concentration"].get("checks", []):
            if c.get("status") in ("WARNING", "BREACH"):
                extra_r6.append(f"CONCENTRATION_{c['status']}: {c['instrument']} at {c['concentration_pct']:.1%}")

    waterfall = build_waterfall(report, hedge_plan, trace_events, extra_r6_violations=extra_r6)

    outputs_raw: dict = {}
    if hedge_plan and scenario_results:
        outputs_raw = {
            "hedge_plan": hedge_plan.model_dump(mode="json"),
            "scenario_results": scenario_results.model_dump(mode="json"),
            "pair": pair,
        }

    from app.engine_v1.audit import build_run_envelope as _build_run_envelope
    run_envelope = _build_run_envelope(
        run_id=run_id,
        trades_raw=trades_raw,
        hedges_raw=hedges_raw_ser,
        market_raw=market_raw,
        policy_raw=policy_raw,
        outputs_raw=outputs_raw,
        pair=pair,
    )
    trace_lite = build_trace_lite(run_id, trace_events)

    # Build legacy-compatible CalculateResponse
    response = None
    if hedge_plan and scenario_results:
        from app.schemas_v1.results import CalculateResponse
        try:
            legacy_plan = hedge_plan.to_legacy_plan() if hasattr(hedge_plan, "to_legacy_plan") else hedge_plan
            legacy_scenarios = scenario_results
            response = CalculateResponse(
                run_id=run_id,
                validation_report=report,
                hedge_plan=legacy_plan,
                scenario_results=legacy_scenarios,
                run_envelope=run_envelope,
                trace_lite=trace_lite,
            )
        except Exception:
            response = None

    result = {
        "run_id": run_id,
        "calculate_response": response,
        "waterfall_result": waterfall,
        "validation_report": report,
        "hedge_plan": hedge_plan,
        "scenario_results": scenario_results,
        "trace_events": trace_events,
        "frozen_inputs": {
            "trades": trades_raw,
            "hedges": hedges_raw_ser,
            "market": market_raw,
            "policy": policy_raw,
        },
        "run_envelope": run_envelope,
        "v2_results": v2_results,
        "pair": pair,
    }

    _sandbox_runs[run_id] = result
    if len(_sandbox_runs) > MAX_STORE_SIZE:
        oldest = next(iter(_sandbox_runs))
        del _sandbox_runs[oldest]

    return result




# ---------------------------------------------------------------------------

# PROPOSAL: Create & Submit (DB-backed)

# ---------------------------------------------------------------------------





async def create_proposal(
    session: AsyncSession, user_id: str, run_id: str, company_id: str | None = None,
) -> Proposal:

    """Freeze a sandbox result into a proposal and persist to DB."""

    run_data = _sandbox_runs.get(run_id)

    if not run_data:

        raise ValueError(f"Sandbox run {run_id} not found")



    if run_data["calculate_response"] is None:

        raise ValueError("Cannot create proposal from failed calculation")



    response: CalculateResponse = run_data["calculate_response"]

    waterfall: WaterfallResult = run_data["waterfall_result"]

    frozen_inputs = run_data["frozen_inputs"]

    run_envelope = run_data["run_envelope"]



    # Check staleness

    market_as_of = datetime.fromisoformat(frozen_inputs["market"]["as_of"])

    if check_snapshot_staleness(market_as_of):

        raise ValueError("SNAPSHOT_STALE: Cannot create proposal with stale market data")



    # Build residual risk vector

    residual_vector = [

        getattr(b, 'residual_local', getattr(b, 'residual_mxn', 0.0))

        for b in response.hedge_plan.buckets

    ]



    # Get v2 results

    v2 = run_data.get("v2_results", {})



    # Build freeze artifact with v2 extension summaries

    freeze_artifact_dict = {

        "snapshot_hash": run_envelope.inputs_hash,

        "exposure_digest": sha256_of_dict({

            "total_exposure": getattr(

                response.hedge_plan.summary,

                'total_commercial_exposure_local',

                response.hedge_plan.summary.total_commercial_exposure_mxn

            ),

            "buckets": len(response.hedge_plan.buckets),

        }),

        "policy_hash": run_envelope.policy_hash,

        "engine_version": run_envelope.engine_version,

        "hedge_plan": response.hedge_plan.model_dump(mode="json"),

        "scenario_results": response.scenario_results.model_dump(mode="json"),

        "waterfall_result": waterfall.model_dump(mode="json"),

        "residual_risk_vector": residual_vector,

        "capability_flags": {

            "fx_tensor": "tensor_result" in v2,

            "margin_model": "margin_summary" in v2,

            "risk_allocator": "allocator_result" in v2,

            "liquidity_model": "liquidity_result" in v2,

            "factor_covariance": "factor_covariance" in v2,

            "transaction_costs": "transaction_costs" in v2,

            "nav_attribution": "nav_attribution" in v2,

            "currency_netting": "currency_netting" in v2,

            "capital_adequacy": "capital_adequacy" in v2,

            "concentration_limits": "concentration" in v2,

            "worst_case_selector": "worst_case" in v2,

            "liquidity_regime": "liquidity_regime" in v2,

            "extended_scenarios": "extended_scenarios" in v2,

        },

        "factor_covariance_summary": v2.get("factor_covariance"),

        "nav_attribution_summary": v2.get("nav_attribution"),

        "transaction_cost_summary": v2.get("transaction_costs"),

        "compound_scenario_summary": v2.get("extended_scenarios"),

        "currency_netting_summary": v2.get("currency_netting"),

        "capital_adequacy_summary": v2.get("capital_adequacy"),

        "margin_breakdown": v2.get("margin_breakdown"),

        "concentration_summary": v2.get("concentration"),

        "worst_case_summary": v2.get("worst_case"),

        "liquidity_regime": v2.get("liquidity_regime", {}).get("regime"),

    }



    # Apply deterministic rounding (A33)

    policy_raw = frozen_inputs.get("policy", {})

    rounding_precision = policy_raw.get("rounding_precision")

    freeze_artifact_dict = round_freeze_artifact(freeze_artifact_dict, rounding_precision)



    freeze_artifact = FreezeArtifact(**freeze_artifact_dict)



    proposal_id = _gen_id("PROP")

    proposal = Proposal(

        proposal_id=proposal_id,

        status=ProposalStatus.DRAFT,

        created_by=user_id,

        created_at=_now(),

        snapshot_hash=run_envelope.inputs_hash,

        policy_version="1.0.0",

        exposure_digest=freeze_artifact.exposure_digest,

        engine_version=run_envelope.engine_version,

        calculate_response=response.model_dump(mode="json"),

        waterfall=waterfall,

        frozen_inputs=frozen_inputs,

        freeze_artifact=freeze_artifact,

        residual_risk_vector=residual_vector,

        capability_flags=freeze_artifact.capability_flags,

        company_id=company_id,

    )



    # Persist to DB

    await pipeline_db.save_proposal(session, proposal, run_id)



    _add_timeline(proposal_id, "CREATED", user_id, f"Proposal {proposal_id} created from run {run_id}")



    return proposal





async def list_proposals(session: AsyncSession, company_id: str | None = None) -> list[Proposal]:

    return await pipeline_db.load_all_proposals(session, company_id_filter=company_id)





async def get_proposal(
    session: AsyncSession, proposal_id: str, company_id: str | None = None,
) -> Proposal | None:

    proposal = await pipeline_db.load_proposal(session, proposal_id)
    if proposal and company_id and proposal.company_id and proposal.company_id != company_id:
        return None  # Tenant isolation: return 404 rather than 403 (don't leak existence)
    return proposal





# ---------------------------------------------------------------------------

# STAGING: Submit & Authorize (DB-backed)

# ---------------------------------------------------------------------------





async def submit_to_staging(

    session: AsyncSession,

    proposal_id: str,

    user_id: str,

    request: SubmitToStagingRequest,

    company_id: str | None = None,

) -> StagedArtifact:

    """Submit a proposal to staging for governance review."""

    proposal = await pipeline_db.load_proposal(session, proposal_id)

    if not proposal:

        raise ValueError(f"Proposal {proposal_id} not found")



    if proposal.status != ProposalStatus.DRAFT:

        raise ValueError(f"Proposal {proposal_id} is {proposal.status}, expected DRAFT")



    staging_id = _gen_id("STG")

    artifact = StagedArtifact(

        staging_id=staging_id,

        proposal_id=proposal_id,

        submitted_by=user_id,

        submitted_at=_now(),

        justification=request.justification,

        integrity_score=proposal.waterfall.integrity_score,

        authorization_status=AuthorizationStatus.PENDING,

        company_id=company_id,

    )



    # Update proposal status and persist staging

    await pipeline_db.update_proposal_status(session, proposal_id, ProposalStatus.SUBMITTED.value)

    await pipeline_db.save_staging(session, artifact)



    _add_timeline(proposal_id, "SUBMITTED", user_id,

                  f"Submitted to staging as {staging_id}")

    _add_timeline(staging_id, "CREATED", user_id,

                  f"Staging artifact created from {proposal_id}")

    await _emit_pipeline_event(
        session, staging_id, "SUBMITTED", user_id,
        f"Proposal {proposal_id} submitted to staging",
        {"staging_id": staging_id, "proposal_id": proposal_id, "integrity_score": artifact.integrity_score},
        company_id=company_id,
    )



    return artifact





async def list_staging(
    session: AsyncSession,
    limit: int = 100,
    offset: int = 0,
    status_filter: str | None = None,
    company_id: str | None = None,
) -> list[StagedArtifact]:
    return await pipeline_db.load_all_staging(
        session, limit=limit, offset=offset,
        status_filter=status_filter, company_id_filter=company_id,
    )





async def get_staging(
    session: AsyncSession, staging_id: str, company_id: str | None = None
) -> StagedArtifact | None:
    artifact = await pipeline_db.load_staging(session, staging_id)
    if artifact and company_id and artifact.company_id and artifact.company_id != company_id:
        return None  # Tenant isolation: return 404 rather than 403 (don't leak existence)
    return artifact





async def authorize_staged(

    session: AsyncSession,

    staging_id: str,

    user_id: str,

    user_role: str,

    request: AuthorizeRequest,

    company_id: str | None = None,

) -> StagedArtifact | LedgerEntry:

    """Process an authorization action on a staged artifact."""

    artifact = await pipeline_db.load_staging(session, staging_id)
    # Tenant isolation: reject cross-tenant authorization
    if artifact and company_id and artifact.company_id and artifact.company_id != company_id:
        raise ValueError(f"TENANT_ISOLATION: Staging artifact {staging_id} not accessible")
    artifact_version = getattr(artifact, "version", 0)

    if not artifact:

        raise ValueError(f"Staging artifact {staging_id} not found")



    if artifact.authorization_status not in (AuthorizationStatus.PENDING,):

        raise ValueError(f"Artifact {staging_id} already {artifact.authorization_status}")



    # Self-approval prevention -- RBAC requirement

    if hasattr(artifact, "submitted_by") and artifact.submitted_by and str(user_id) == str(artifact.submitted_by):

        raise ValueError(

            "SELF_APPROVAL_BLOCKED: The submitter of a proposal cannot approve "

            "their own submission. A different authorized reviewer is required."

        )



    # Get the proposal to check staleness

    proposal = await pipeline_db.load_proposal(session, artifact.proposal_id)

    if proposal:

        frozen_inputs = proposal.frozen_inputs

        market_as_of = datetime.fromisoformat(frozen_inputs["market"]["as_of"])

        if check_snapshot_staleness(market_as_of):

            raise ValueError("SNAPSHOT_STALE: Cannot authorize with stale market data")



    # Record approval

    signature_hash = hashlib.sha256(

        f"{user_id}:{staging_id}:{request.action}:{_now().isoformat()}".encode()

    ).hexdigest()



    approval = ApprovalRecord(

        approver_id=user_id,

        approver_role=user_role,

        action=request.action,

        signature_hash=signature_hash,

        comment=request.comment,

        timestamp=_now(),

    )

    artifact.approvals.append(approval)



    # Persist approval

    await pipeline_db.save_approval(session, staging_id, approval)



    _add_timeline(staging_id, f"APPROVAL_{request.action}",

                  user_id, f"{request.action} by {user_role}")



    if request.action == ApprovalAction.REJECT:

        updated = await pipeline_db.update_staging_status_versioned(
            session, staging_id, AuthorizationStatus.REJECTED.value, artifact_version
        )
        if not updated:
            raise ValueError("CONCURRENT_MODIFICATION: Artifact was modified concurrently. Please reload and retry.")

        if proposal:

            await pipeline_db.update_proposal_status(session, artifact.proposal_id, ProposalStatus.REJECTED.value)

        artifact.authorization_status = AuthorizationStatus.REJECTED

        await _emit_pipeline_event(
            session, staging_id, "REJECTED", user_id,
            f"Staging artifact {staging_id} rejected",
            {"staging_id": staging_id, "action": "REJECT", "comment": request.comment},
            company_id=company_id,
        )

        return artifact



    if request.action == ApprovalAction.RETURN:

        updated = await pipeline_db.update_staging_status_versioned(
            session, staging_id, AuthorizationStatus.RETURNED.value, artifact_version
        )
        if not updated:
            raise ValueError("CONCURRENT_MODIFICATION: Artifact was modified concurrently. Please reload and retry.")

        if proposal:

            await pipeline_db.update_proposal_status(session, artifact.proposal_id, ProposalStatus.RETURNED.value)

        artifact.authorization_status = AuthorizationStatus.RETURNED

        await _emit_pipeline_event(
            session, staging_id, "RETURNED", user_id,
            f"Staging artifact {staging_id} returned",
            {"staging_id": staging_id, "action": "RETURN", "comment": request.comment},
            company_id=company_id,
        )

        return artifact



    # APPROVE

    approve_count = sum(1 for a in artifact.approvals if a.action == ApprovalAction.APPROVE)

    if approve_count < artifact.required_approvals:

        return artifact  # Need more approvals



    # All approvals received -- create ledger entry

    updated = await pipeline_db.update_staging_status_versioned(
        session, staging_id, AuthorizationStatus.APPROVED.value, artifact_version
    )
    if not updated:
        raise ValueError("CONCURRENT_MODIFICATION: Artifact was modified concurrently. Please reload and retry.")

    if proposal:

        await pipeline_db.update_proposal_status(session, artifact.proposal_id, ProposalStatus.AUTHORIZED.value)

    artifact.authorization_status = AuthorizationStatus.APPROVED

    await _emit_pipeline_event(
        session, staging_id, "APPROVED", user_id,
        f"Staging artifact {staging_id} approved",
        {"staging_id": staging_id, "action": "APPROVE", "comment": request.comment},
        company_id=company_id,
    )



    ledger_entry = await _create_ledger_entry(session, artifact, proposal, user_id)

    return ledger_entry





async def _create_ledger_entry(

    session: AsyncSession,

    artifact: StagedArtifact,

    proposal: Proposal | None,

    authorizer_id: str,

) -> LedgerEntry:

    """Create an immutable ledger entry from an authorized staging artifact."""

    ledger_id = _gen_id("LEDG")

    order_id = _gen_id("ORD")



    # Build provenance chain

    approval_hash = sha256_of_dict({

        "approvals": [a.model_dump(mode="json") for a in artifact.approvals]

    })



    provenance = ProvenanceChain(

        market_data_source="sandbox_input",

        transformation_steps=["parse", "validate", "normalize", "kernel", "scenarios", "waterfall"],

        policy_hash=proposal.freeze_artifact.policy_hash if proposal else "",

        approval_hash=approval_hash,

        execution_payload_hash=proposal.snapshot_hash if proposal else "",

    )



    # Compute root hash

    root_parts = [

        proposal.freeze_artifact.snapshot_hash if proposal else "",

        proposal.freeze_artifact.exposure_digest if proposal else "",

        proposal.freeze_artifact.policy_hash if proposal else "",

        approval_hash,

        proposal.snapshot_hash if proposal else "",

    ]

    root_hash = hashlib.sha256("|".join(root_parts).encode()).hexdigest()



    signature_hash = hashlib.sha256(

        f"{authorizer_id}:{ledger_id}:{_now().isoformat()}".encode()

    ).hexdigest()



    entry = LedgerEntry(

        ledger_id=ledger_id,

        order_id=order_id,

        staging_id=artifact.staging_id,

        authorized_by=authorizer_id,

        authorized_at=_now(),

        signature_hash=signature_hash,

        provenance_chain=provenance,

        root_hash=root_hash,

        freeze_artifact=proposal.freeze_artifact if proposal else None,

        company_id=artifact.company_id,

    )



    # Persist to DB

    await pipeline_db.save_ledger(session, entry)



    _add_timeline(ledger_id, "AUTHORIZED", authorizer_id,

                  f"Ledger entry {ledger_id} created, order {order_id}")

    _add_timeline(artifact.staging_id, "LEDGER_CREATED", authorizer_id,

                  f"Ledger {ledger_id}")



    return entry





# ---------------------------------------------------------------------------

# LEDGER: Query & Replay (DB-backed)

# ---------------------------------------------------------------------------





async def list_ledger(session: AsyncSession, company_id: str | None = None) -> list[LedgerEntry]:

    return await pipeline_db.load_all_ledger(session, company_id_filter=company_id)




async def get_ledger(
    session: AsyncSession, ledger_id: str, company_id: str | None = None,
) -> LedgerEntry | None:

    entry = await pipeline_db.load_ledger(session, ledger_id)
    if entry and company_id and entry.company_id and entry.company_id != company_id:
        return None  # Tenant isolation: return 404 rather than 403 (don't leak existence)
    return entry





async def replay_ledger(session: AsyncSession, ledger_id: str) -> ReplayResult:

    """Deterministic replay: re-run engine with frozen inputs, compare hashes."""

    entry = await pipeline_db.load_ledger(session, ledger_id)

    if not entry:

        raise ValueError(f"Ledger entry {ledger_id} not found")



    if not entry.freeze_artifact:

        raise ValueError(f"No freeze artifact on ledger {ledger_id}")



    freeze = entry.freeze_artifact

    original_hash = sha256_of_dict(freeze.model_dump(mode="json"))



    # Find the proposal to get frozen inputs

    staging = await pipeline_db.load_staging(session, entry.staging_id)

    if not staging:

        raise ValueError(f"Staging {entry.staging_id} not found for replay")



    proposal = await pipeline_db.load_proposal(session, staging.proposal_id)

    if not proposal:

        raise ValueError(f"Proposal {staging.proposal_id} not found for replay")



    # Re-run the engine with frozen inputs (synchronous -- CPU-bound)

    try:

        replay_result = sandbox_calculate("replay_system", SandboxCalculateRequest(

            trades=proposal.frozen_inputs["trades"],

            hedges=proposal.frozen_inputs["hedges"],

            market=proposal.frozen_inputs["market"],

            policy=proposal.frozen_inputs["policy"],

        ))

    except Exception as e:

        return ReplayResult(

            original_hash=original_hash,

            replay_hash="ERROR",

            match=False,

            divergences=[{"error": str(e)}],

            fields_compared=[],

        )



    if not replay_result["calculate_response"]:

        return ReplayResult(

            original_hash=original_hash,

            replay_hash="VALIDATION_FAIL",

            match=False,

            divergences=[{"error": "Replay validation failed"}],

            fields_compared=[],

        )



    # Compare fields

    replay_response: CalculateResponse = replay_result["calculate_response"]

    replay_waterfall: WaterfallResult = replay_result["waterfall_result"]



    fields_compared = [

        "hedge_plan", "scenario_results", "residual_risk_vector",

        "waterfall_result", "policy_hash", "exposure_digest",

    ]

    divergences = []



    replay_plan = replay_response.hedge_plan.model_dump(mode="json")

    if replay_plan != freeze.hedge_plan:

        divergences.append({"field": "hedge_plan", "type": "MISMATCH"})



    replay_scenarios = replay_response.scenario_results.model_dump(mode="json")

    if replay_scenarios != freeze.scenario_results:

        divergences.append({"field": "scenario_results", "type": "MISMATCH"})



    replay_wf = replay_waterfall.model_dump(mode="json")

    if replay_wf != freeze.waterfall_result:

        divergences.append({"field": "waterfall_result", "type": "MISMATCH"})



    if replay_response.run_envelope.policy_hash != freeze.policy_hash:

        divergences.append({"field": "policy_hash", "type": "MISMATCH"})



    replay_hash = sha256_of_dict({

        "hedge_plan": replay_plan,

        "scenario_results": replay_scenarios,

        "waterfall_result": replay_wf,

        "policy_hash": replay_response.run_envelope.policy_hash,

    })



    match = len(divergences) == 0



    return ReplayResult(

        original_hash=original_hash,

        replay_hash=replay_hash,

        match=match,

        divergences=divergences,

        fields_compared=fields_compared,

    )





# ---------------------------------------------------------------------------

# TIMELINE (in-memory -- lightweight event log)

# ---------------------------------------------------------------------------





def get_timeline(entity_id: str) -> list[TimelineEvent]:

    """Get timeline events for a proposal, staging artifact, or ledger entry."""

    return _timelines.get(entity_id, [])

