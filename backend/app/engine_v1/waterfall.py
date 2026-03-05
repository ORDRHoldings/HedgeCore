"""Waterfall Builder: Maps V-codes to R1-R8 rule cascade with integrity scoring.



Groups existing validator.py output (21 V-codes) into 8 institutional rule blocks.

R7/R8 derived from kernel trace events (suppression, bucket counts).

Returns WaterfallResult with per-rule status and integrity score (0-100).

"""



from app.schemas_v1.errors import Severity, ValidationErrorDetail
from app.schemas_v1.pipeline import WaterfallResult, WaterfallRule, WaterfallRuleStatus
from app.schemas_v1.results import HedgePlan, TraceEvent, ValidationReport

# ---------------------------------------------------------------------------

# V-Code -> R-Rule Mapping

# ---------------------------------------------------------------------------



R1_CODES = {"V-001", "V-002", "V-003", "V-004", "V-019"}  # Data Ingestion Gate

R2_CODES = {"V-005", "V-006", "V-010"}                     # Temporal Integrity

R3_CODES = {"V-007", "V-008", "V-009"}                     # Instrument Validation

R4_CODES = {"V-011", "V-012", "V-013", "V-021"}            # Market Data Integrity

R5_CODES = {"V-014", "V-015"}                              # Cross-Reference Binding

R6_CODES = {"V-016", "V-017", "V-018"}                     # Policy Compliance



RULE_MAP = {

    "R1": ("Data Ingestion Gate", R1_CODES),

    "R2": ("Temporal Integrity", R2_CODES),

    "R3": ("Instrument Validation", R3_CODES),

    "R4": ("Market Data Integrity", R4_CODES),

    "R5": ("Cross-Reference Binding", R5_CODES),

    "R6": ("Policy Compliance", R6_CODES),

}



# Weight per rule for integrity score (total = 100)

RULE_WEIGHTS = {

    "R1": 15,

    "R2": 10,

    "R3": 10,

    "R4": 15,

    "R5": 10,

    "R6": 10,

    "R7": 15,

    "R8": 15,

}





def _classify_errors(

    errors: list[ValidationErrorDetail],

    code_set: set[str],

) -> tuple[WaterfallRuleStatus, list[str], list[str]]:

    """Classify errors for a given rule's V-code set."""

    matched_codes: list[str] = []

    details: list[str] = []

    has_critical = False

    has_warning = False



    for err in errors:

        if err.code in code_set:

            matched_codes.append(err.code)

            details.append(f"[{err.code}] {err.message}")

            if err.severity == Severity.CRITICAL:

                has_critical = True

            elif err.severity == Severity.WARNING:

                has_warning = True



    if has_critical:

        status = WaterfallRuleStatus.FAIL

    elif has_warning:

        status = WaterfallRuleStatus.WARN

    else:

        status = WaterfallRuleStatus.PASS



    return status, matched_codes, details





def _build_r7(

    hedge_plan: HedgePlan | None,

    trace_events: list[TraceEvent],

) -> WaterfallRule:

    """R7 -- Exposure Netting (kernel steps 1-6)."""

    details: list[str] = []

    v_codes: list[str] = []



    if hedge_plan is None:

        return WaterfallRule(

            rule_id="R7",

            name="Exposure Netting",

            status=WaterfallRuleStatus.FAIL,

            v_codes=[],

            details=["Kernel did not execute -- validation failed"],

            result_summary="No hedge plan produced",

        )



    bucket_count = len(hedge_plan.buckets)

    total_exposure = hedge_plan.summary.total_commercial_exposure_mxn

    total_hedges = hedge_plan.summary.total_existing_hedges_mxn

    details.append(f"Processed {bucket_count} buckets")

    details.append(f"Total exposure: {total_exposure:,.2f} MXN")

    details.append(f"Total existing hedges: {total_hedges:,.2f} MXN")



    # Check for zero-exposure buckets

    zero_buckets = [b.bucket for b in hedge_plan.buckets if b.commercial_exposure_mxn == 0]

    if zero_buckets:

        details.append(f"Zero-exposure buckets: {zero_buckets}")



    return WaterfallRule(

        rule_id="R7",

        name="Exposure Netting",

        status=WaterfallRuleStatus.PASS,

        v_codes=v_codes,

        details=details,

        result_summary=f"{bucket_count} buckets, {total_exposure:,.0f} MXN exposure",

    )





def _build_r8(

    hedge_plan: HedgePlan | None,

    trace_events: list[TraceEvent],

) -> WaterfallRule:

    """R8 -- Execution Filtering (kernel steps 7-13)."""

    details: list[str] = []



    if hedge_plan is None:

        return WaterfallRule(

            rule_id="R8",

            name="Execution Filtering",

            status=WaterfallRuleStatus.FAIL,

            v_codes=[],

            details=["Kernel did not execute"],

            result_summary="No execution data",

        )



    total_action = hedge_plan.summary.total_action_usd

    total_friction = hedge_plan.summary.total_friction_usd

    suppressed_count = sum(1 for b in hedge_plan.buckets if b.suppressed)

    active_count = len(hedge_plan.buckets) - suppressed_count



    details.append(f"Active hedges: {active_count}, Suppressed: {suppressed_count}")

    details.append(f"Total action: {total_action:,.2f} USD")

    details.append(f"Total friction: {total_friction:,.2f} USD")



    # Check trace events for suppression details

    suppression_events = [e for e in trace_events if "suppressed" in e.detail.lower()]

    for evt in suppression_events:

        details.append(f"Suppressed: {evt.detail}")



    status = WaterfallRuleStatus.PASS

    if suppressed_count > 0:

        status = WaterfallRuleStatus.WARN



    return WaterfallRule(

        rule_id="R8",

        name="Execution Filtering",

        status=status,

        v_codes=[],

        details=details,

        result_summary=f"{active_count} active, {suppressed_count} suppressed",

    )





def build_waterfall(

    validation_report: ValidationReport,

    hedge_plan: HedgePlan | None,

    trace_events: list[TraceEvent],

    extra_r6_violations: list[str] | None = None,

    weight_overrides: dict | None = None,

) -> WaterfallResult:

    """Build complete R1-R8 waterfall from validator output and kernel results.



    Args:

        validation_report: Output of validator.validate_all()

        hedge_plan: Output of kernel (None if validation failed)

        trace_events: Trace events from kernel execution

        extra_r6_violations: Additional policy violations (from hedge bands, concentration, etc.)



    Returns:

        WaterfallResult with all 8 rules and integrity score

    """

    # FIX-09: apply weight overrides from policy with normalization

    effective_weights = dict(RULE_WEIGHTS)

    if weight_overrides:

        for rule_id, weight in weight_overrides.items():

            if rule_id in effective_weights and isinstance(weight, int | float) and 0 <= weight <= 100:

                effective_weights[rule_id] = int(weight)

        # Normalize to sum 100 if overrides changed total

        total_weight = sum(effective_weights.values())

        if total_weight != 100 and total_weight > 0:

            scale = 100.0 / total_weight

            effective_weights = {k: round(v * scale) for k, v in effective_weights.items()}



    all_errors = validation_report.errors

    # Also include warnings as ValidationErrorDetail

    warning_details = [

        ValidationErrorDetail(

            code="W-INFO",

            field="",

            message=w,

            severity=Severity.WARNING,

        )

        for w in validation_report.warnings

    ]



    rules: list[WaterfallRule] = []



    # R1-R6: Pre-kernel validation rules

    for rule_id, (rule_name, code_set) in RULE_MAP.items():

        status, v_codes, details = _classify_errors(all_errors, code_set)



        # R6 gets extra violations from hedge bands / concentration

        if rule_id == "R6" and extra_r6_violations:

            for violation in extra_r6_violations:

                details.append(violation)

                if status == WaterfallRuleStatus.PASS:

                    status = WaterfallRuleStatus.WARN



        rules.append(WaterfallRule(

            rule_id=rule_id,

            name=rule_name,

            status=status,

            v_codes=v_codes,

            details=details,

            result_summary=f"{len(v_codes)} codes checked" if v_codes else "Clean",

        ))



    # R7-R8: Kernel-derived rules

    rules.append(_build_r7(hedge_plan, trace_events))

    rules.append(_build_r8(hedge_plan, trace_events))



    # Compute integrity score using effective weights (may include overrides)

    integrity_score = 0.0

    for rule in rules:

        weight = effective_weights.get(rule.rule_id, 0)

        if rule.status == WaterfallRuleStatus.PASS:

            integrity_score += weight

        elif rule.status == WaterfallRuleStatus.WARN:

            integrity_score += weight * 0.5  # Partial credit for warnings



    # Overall status

    has_fail = any(r.status == WaterfallRuleStatus.FAIL for r in rules)

    has_warn = any(r.status == WaterfallRuleStatus.WARN for r in rules)



    if has_fail:

        overall = "FAIL"

    elif has_warn:

        overall = "WARN"

    else:

        overall = "PASS"



    integrity_score = min(100.0, round(integrity_score, 1))  # clamp rounding drift
    return WaterfallResult(

        rules=rules,

        overall_status=overall,

        integrity_score=integrity_score,

    )

