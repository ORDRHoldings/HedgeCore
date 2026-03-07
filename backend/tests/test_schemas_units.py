"""
Comprehensive unit tests for Pydantic schema and model modules.

Pure unit tests -- no database, no HTTP, no external services.
Covers: pipeline, policies, positions, results, market, organization, rbac, api_key schemas.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

# ---------------------------------------------------------------------------
# pipeline.py
# ---------------------------------------------------------------------------
from app.schemas_v1.pipeline import (
    ApprovalAction,
    ApprovalRecord,
    AuthorizationStatus,
    AuthorizeRequest,
    CreateProposalRequest,
    FreezeArtifact,
    LedgerEntry,
    LedgerListResponse,
    ProposalListResponse,
    ProposalStatus,
    ProvenanceChain,
    ReplayResult,
    SandboxCalculateRequest,
    StagedArtifact,
    StagingListResponse,
    SubmitToStagingRequest,
    TimelineEvent,
    TimelineResponse,
    WaterfallResult,
    WaterfallRule,
    WaterfallRuleStatus,
)


class TestWaterfallRuleStatus:
    def test_enum_values(self):
        assert WaterfallRuleStatus.PASS.value == "PASS"
        assert WaterfallRuleStatus.FAIL.value == "FAIL"
        assert WaterfallRuleStatus.WARN.value == "WARN"

    def test_from_string(self):
        assert WaterfallRuleStatus("PASS") is WaterfallRuleStatus.PASS


class TestWaterfallRule:
    def test_minimal(self):
        r = WaterfallRule(rule_id="R1", name="Limit check", status=WaterfallRuleStatus.PASS)
        assert r.rule_id == "R1"
        assert r.v_codes == []
        assert r.details == []
        assert r.threshold is None
        assert r.result_summary == ""

    def test_full(self):
        r = WaterfallRule(
            rule_id="R3",
            name="Coverage ratio",
            status=WaterfallRuleStatus.WARN,
            v_codes=["V301"],
            details=["Coverage below 80%"],
            threshold=80.0,
            result_summary="Marginal",
        )
        assert r.threshold == 80.0
        assert len(r.v_codes) == 1


class TestWaterfallResult:
    def test_valid(self):
        rule = WaterfallRule(rule_id="R1", name="test", status=WaterfallRuleStatus.PASS)
        wr = WaterfallResult(rules=[rule], overall_status="PASS", integrity_score=95.5)
        assert wr.integrity_score == 95.5

    def test_integrity_score_lower_bound(self):
        rule = WaterfallRule(rule_id="R1", name="test", status=WaterfallRuleStatus.PASS)
        with pytest.raises(ValidationError):
            WaterfallResult(rules=[rule], overall_status="PASS", integrity_score=-1)

    def test_integrity_score_upper_bound(self):
        rule = WaterfallRule(rule_id="R1", name="test", status=WaterfallRuleStatus.PASS)
        with pytest.raises(ValidationError):
            WaterfallResult(rules=[rule], overall_status="PASS", integrity_score=101)

    def test_overall_status_literal_invalid(self):
        rule = WaterfallRule(rule_id="R1", name="test", status=WaterfallRuleStatus.PASS)
        with pytest.raises(ValidationError):
            WaterfallResult(rules=[rule], overall_status="INVALID", integrity_score=50)


class TestFreezeArtifact:
    def test_minimal(self):
        fa = FreezeArtifact(
            snapshot_hash="abc123",
            exposure_digest="digest",
            policy_hash="phash",
            engine_version="1.0.0",
            hedge_plan={"total": 100},
            scenario_results={"sigmas": []},
            waterfall_result={"rules": []},
            residual_risk_vector=[0.01, 0.02],
        )
        assert fa.capability_flags == {}
        assert fa.factor_covariance_summary is None
        assert fa.liquidity_regime is None

    def test_ext2_ext3_fields(self):
        fa = FreezeArtifact(
            snapshot_hash="h", exposure_digest="d", policy_hash="p",
            engine_version="1.0.0", hedge_plan={}, scenario_results={},
            waterfall_result={}, residual_risk_vector=[],
            factor_covariance_summary={"x": 1},
            nav_attribution_summary={"y": 2},
            capital_adequacy_summary={"z": 3},
            margin_breakdown={"m": 4},
            concentration_summary={"c": 5},
            worst_case_summary={"w": 6},
            liquidity_regime="HIGH",
        )
        assert fa.liquidity_regime == "HIGH"
        assert fa.margin_breakdown == {"m": 4}


class TestProposalStatus:
    def test_all_values(self):
        expected = {"DRAFT", "SUBMITTED", "RETURNED", "AUTHORIZED", "REJECTED"}
        assert {s.value for s in ProposalStatus} == expected


class TestApprovalAction:
    def test_all_values(self):
        expected = {"APPROVE", "REJECT", "RETURN"}
        assert {a.value for a in ApprovalAction} == expected


class TestApprovalRecord:
    def test_defaults(self):
        ar = ApprovalRecord(
            approver_id="usr-1",
            approver_role="checker",
            action=ApprovalAction.APPROVE,
            signature_hash="sig",
        )
        assert ar.comment == ""
        assert ar.timestamp is None

    def test_with_timestamp(self):
        now = datetime.now(timezone.utc)
        ar = ApprovalRecord(
            approver_id="usr-1",
            approver_role="admin",
            action=ApprovalAction.REJECT,
            signature_hash="sig",
            comment="Looks wrong",
            timestamp=now,
        )
        assert ar.timestamp == now


class TestStagedArtifact:
    def test_defaults(self):
        now = datetime.now(timezone.utc)
        sa = StagedArtifact(
            staging_id="stg-1",
            proposal_id="prop-1",
            submitted_by="user-a",
            submitted_at=now,
            integrity_score=88.0,
        )
        assert sa.justification == ""
        assert sa.authorization_status == AuthorizationStatus.PENDING
        assert sa.approvals == []
        assert sa.required_approvals == 1
        assert sa.version == 0
        assert sa.company_id is None

    def test_integrity_score_validation(self):
        now = datetime.now(timezone.utc)
        with pytest.raises(ValidationError):
            StagedArtifact(
                staging_id="stg-1", proposal_id="prop-1",
                submitted_by="user", submitted_at=now,
                integrity_score=150,
            )


class TestProvenanceChain:
    def test_defaults(self):
        pc = ProvenanceChain()
        assert pc.market_data_source == ""
        assert pc.transformation_steps == []
        assert pc.policy_hash == ""


class TestLedgerEntry:
    def test_minimal(self):
        now = datetime.now(timezone.utc)
        fa = FreezeArtifact(
            snapshot_hash="h", exposure_digest="d", policy_hash="p",
            engine_version="1.0.0", hedge_plan={}, scenario_results={},
            waterfall_result={}, residual_risk_vector=[],
        )
        le = LedgerEntry(
            ledger_id="LEDG-001",
            order_id="ORD-001",
            staging_id="stg-1",
            authorized_by="checker-1",
            authorized_at=now,
            signature_hash="sig",
            provenance_chain=ProvenanceChain(),
        )
        assert le.replay_verified is False
        assert le.root_hash == ""
        assert le.freeze_artifact is None

    def test_with_freeze_artifact(self):
        now = datetime.now(timezone.utc)
        fa = FreezeArtifact(
            snapshot_hash="h", exposure_digest="d", policy_hash="p",
            engine_version="1.0.0", hedge_plan={}, scenario_results={},
            waterfall_result={}, residual_risk_vector=[],
        )
        le = LedgerEntry(
            ledger_id="LEDG-002", order_id="ORD-002", staging_id="stg-2",
            authorized_by="admin", authorized_at=now, signature_hash="sig",
            provenance_chain=ProvenanceChain(), freeze_artifact=fa,
        )
        assert le.freeze_artifact is not None


class TestReplayResult:
    def test_match(self):
        rr = ReplayResult(original_hash="aaa", replay_hash="aaa", match=True)
        assert rr.divergences == []
        assert rr.fields_compared == []

    def test_mismatch(self):
        rr = ReplayResult(
            original_hash="aaa", replay_hash="bbb", match=False,
            divergences=[{"field": "spot", "original": 17.0, "replay": 17.1}],
            fields_compared=["spot"],
        )
        assert len(rr.divergences) == 1


class TestTimelineEvent:
    def test_defaults(self):
        now = datetime.now(timezone.utc)
        te = TimelineEvent(event_type="CREATED", timestamp=now, actor="admin")
        assert te.detail == ""
        assert te.metadata == {}


class TestSandboxCalculateRequest:
    def test_minimal(self):
        req = SandboxCalculateRequest(
            trades=[{"record_id": "T1"}],
            hedges=[],
            market={"spot": 17.0},
            policy={"ratio": 0.8},
        )
        assert req.extended_market is None
        assert req.extended_policy is None


class TestCreateProposalRequest:
    def test_defaults(self):
        r = CreateProposalRequest(run_id="run-123")
        assert r.justification == ""


class TestSubmitToStagingRequest:
    def test_defaults(self):
        r = SubmitToStagingRequest()
        assert r.justification == ""


class TestAuthorizeRequest:
    def test_valid(self):
        r = AuthorizeRequest(action=ApprovalAction.APPROVE, comment="LGTM")
        assert r.action == ApprovalAction.APPROVE

    def test_defaults(self):
        r = AuthorizeRequest(action=ApprovalAction.REJECT)
        assert r.comment == ""


class TestListResponses:
    def test_proposal_list(self):
        pl = ProposalListResponse(proposals=[], total=0)
        assert pl.total == 0

    def test_staging_list(self):
        sl = StagingListResponse(artifacts=[], total=0)
        assert sl.total == 0

    def test_ledger_list(self):
        ll = LedgerListResponse(entries=[], total=0)
        assert ll.total == 0

    def test_timeline(self):
        tr = TimelineResponse(events=[])
        assert tr.events == []


# ---------------------------------------------------------------------------
# policies.py
# ---------------------------------------------------------------------------
from app.schemas_v1.policies import (
    ActivatePolicyRequest,
    AddFavoriteRequest,
    CreateTemplateRequest,
    ImportTemplateRequest,
    PolicyAuditEventResponse,
    PolicyConfigSchema,
    PolicyExportResponse,
    PolicyInstanceResponse,
    PolicySeedStatusResponse,
    PolicyTemplateResponse,
    UpdateTemplateRequest,
)


class TestPolicyConfigSchema:
    def test_valid(self):
        pc = PolicyConfigSchema(
            hedge_ratios={"confirmed": 0.9, "forecast": 0.5},
            cost_assumptions={"spread_bps": 5.0},
            execution_product="NDF",
        )
        assert pc.bucket_mode == "CALENDAR_MONTH"
        assert pc.min_trade_size_usd == 0

    def test_missing_required(self):
        with pytest.raises(ValidationError):
            PolicyConfigSchema(
                hedge_ratios={"confirmed": 0.9},
                # missing cost_assumptions and execution_product
            )


class TestCreateTemplateRequest:
    def test_valid(self):
        req = CreateTemplateRequest(
            name="Test Policy",
            short_name="TSTP",
            risk_posture="CONSERVATIVE",
            category="CORPORATE",
            config=PolicyConfigSchema(
                hedge_ratios={"confirmed": 1.0, "forecast": 0.5},
                cost_assumptions={"spread_bps": 3.0},
                execution_product="FWD",
            ),
        )
        assert req.description is None
        assert req.status is None

    def test_name_too_long(self):
        with pytest.raises(ValidationError):
            CreateTemplateRequest(
                name="x" * 256,
                short_name="TP",
                risk_posture="CONSERVATIVE",
                category="CORPORATE",
                config=PolicyConfigSchema(
                    hedge_ratios={}, cost_assumptions={}, execution_product="NDF",
                ),
            )

    def test_short_name_too_long(self):
        with pytest.raises(ValidationError):
            CreateTemplateRequest(
                name="Valid Name",
                short_name="A" * 17,
                risk_posture="MODERATE",
                category="CORPORATE",
                config=PolicyConfigSchema(
                    hedge_ratios={}, cost_assumptions={}, execution_product="NDF",
                ),
            )

    def test_invalid_risk_posture(self):
        with pytest.raises(ValidationError):
            CreateTemplateRequest(
                name="Bad Posture",
                short_name="BP",
                risk_posture="YOLO",
                category="CORPORATE",
                config=PolicyConfigSchema(
                    hedge_ratios={}, cost_assumptions={}, execution_product="NDF",
                ),
            )

    def test_invalid_category(self):
        with pytest.raises(ValidationError):
            CreateTemplateRequest(
                name="Bad Cat",
                short_name="BC",
                risk_posture="AGGRESSIVE",
                category="CUSTOM",
                config=PolicyConfigSchema(
                    hedge_ratios={}, cost_assumptions={}, execution_product="NDF",
                ),
            )

    def test_valid_status_values(self):
        for status_val in ("DRAFT", "REVIEW", "APPROVED", "ACTIVE", "ARCHIVED"):
            req = CreateTemplateRequest(
                name="S", short_name="S", risk_posture="MODERATE",
                category="FINANCIAL",
                config=PolicyConfigSchema(
                    hedge_ratios={}, cost_assumptions={}, execution_product="NDF",
                ),
                status=status_val,
            )
            assert req.status == status_val

    def test_invalid_status(self):
        with pytest.raises(ValidationError):
            CreateTemplateRequest(
                name="X", short_name="X", risk_posture="MODERATE",
                category="FINANCIAL",
                config=PolicyConfigSchema(
                    hedge_ratios={}, cost_assumptions={}, execution_product="NDF",
                ),
                status="DELETED",
            )

    def test_empty_name_rejected(self):
        with pytest.raises(ValidationError):
            CreateTemplateRequest(
                name="",
                short_name="TP",
                risk_posture="MODERATE",
                category="CORPORATE",
                config=PolicyConfigSchema(
                    hedge_ratios={}, cost_assumptions={}, execution_product="NDF",
                ),
            )


class TestUpdateTemplateRequest:
    def test_all_none(self):
        req = UpdateTemplateRequest()
        assert req.name is None
        assert req.config is None

    def test_partial_update(self):
        req = UpdateTemplateRequest(name="Updated Name", risk_posture="AGGRESSIVE")
        assert req.name == "Updated Name"
        assert req.short_name is None

    def test_invalid_risk_posture(self):
        with pytest.raises(ValidationError):
            UpdateTemplateRequest(risk_posture="RECKLESS")

    def test_invalid_category(self):
        with pytest.raises(ValidationError):
            UpdateTemplateRequest(category="INVALID")


class TestActivatePolicyRequest:
    def test_valid_uuid(self):
        uid = uuid.uuid4()
        req = ActivatePolicyRequest(template_id=uid)
        assert req.template_id == uid

    def test_invalid_uuid(self):
        with pytest.raises(ValidationError):
            ActivatePolicyRequest(template_id="not-a-uuid")


class TestPolicyTemplateResponse:
    def test_from_dict(self):
        now = datetime.now(timezone.utc)
        uid = uuid.uuid4()
        resp = PolicyTemplateResponse(
            id=uid, name="Test", short_name="TST",
            risk_posture="CONSERVATIVE", category="CORPORATE",
            config={"hedge_ratios": {}}, version=1, is_system=False,
            created_at=now,
        )
        assert resp.company_id is None
        assert resp.description is None
        assert resp.status is None


class TestPolicyInstanceResponse:
    def test_from_dict(self):
        now = datetime.now(timezone.utc)
        resp = PolicyInstanceResponse(
            id=uuid.uuid4(), company_id=uuid.uuid4(),
            template_id=uuid.uuid4(), activated_by=uuid.uuid4(),
            activated_at=now, is_active=True,
        )
        assert resp.template is None
        assert resp.branch_id is None


class TestAddFavoriteRequest:
    def test_defaults(self):
        req = AddFavoriteRequest()
        assert req.notes is None


class TestImportTemplateRequest:
    def test_valid(self):
        req = ImportTemplateRequest(export_blob={"version": "1.0"})
        assert req.name_override is None
        assert req.short_name_override is None


class TestPolicySeedStatusResponse:
    def test_valid(self):
        resp = PolicySeedStatusResponse(
            seeded=True, count=6, expected_count=6, missing_short_names=[],
        )
        assert resp.seeded is True

    def test_with_missing(self):
        resp = PolicySeedStatusResponse(
            seeded=False, count=4, expected_count=6,
            missing_short_names=["CONS", "AGGR"],
        )
        assert len(resp.missing_short_names) == 2


class TestPolicyAuditEventResponse:
    def test_valid(self):
        now = datetime.now(timezone.utc)
        resp = PolicyAuditEventResponse(
            id=uuid.uuid4(), event_type="CREATED",
            description="Policy template created",
            payload={"name": "Test"}, created_at=now,
        )
        assert resp.actor_email is None


class TestPolicyExportResponse:
    def test_valid(self):
        now = datetime.now(timezone.utc)
        tmpl = PolicyTemplateResponse(
            id=uuid.uuid4(), name="Export", short_name="EXP",
            risk_posture="MODERATE", category="FINANCIAL",
            config={}, version=1, is_system=False, created_at=now,
        )
        resp = PolicyExportResponse(
            export_version="1.0", exported_at=now.isoformat(),
            checksum="abc123", template=tmpl,
        )
        assert resp.export_version == "1.0"


# ---------------------------------------------------------------------------
# positions.py
# ---------------------------------------------------------------------------
from app.schemas_v1.positions import (
    AssignPolicyRequest,
    BulkAssignPolicyRequest,
    BulkAssignResult,
    ExecutePositionRequest,
    ExposureAggregation,
    PositionCreate,
    PositionListResponse,
    PositionResponse,
    PositionUpdate,
    ReadyToExecuteRequest,
    RejectPositionRequest,
)


class TestPositionCreate:
    def test_valid_minimal(self):
        p = PositionCreate(
            record_id="REC-001", entity="Acme Corp",
            flow_type="AR", currency="mxn", amount=500000.0,
            value_date="2026-06-30",
        )
        assert p.currency == "MXN"  # validator uppercases
        assert p.status == "CONFIRMED"
        assert p.description is None

    def test_ap_flow(self):
        p = PositionCreate(
            record_id="REC-002", entity="Corp",
            flow_type="AP", currency="EUR", amount=100.0,
            value_date="2026-01-01",
        )
        assert p.flow_type == "AP"

    def test_invalid_flow_type(self):
        with pytest.raises(ValidationError):
            PositionCreate(
                record_id="R1", entity="E", flow_type="XX",
                currency="USD", amount=100, value_date="2026-01-01",
            )

    def test_negative_amount(self):
        with pytest.raises(ValidationError):
            PositionCreate(
                record_id="R1", entity="E", flow_type="AR",
                currency="USD", amount=-100, value_date="2026-01-01",
            )

    def test_zero_amount(self):
        with pytest.raises(ValidationError):
            PositionCreate(
                record_id="R1", entity="E", flow_type="AR",
                currency="USD", amount=0, value_date="2026-01-01",
            )

    def test_invalid_currency_length(self):
        with pytest.raises(ValidationError):
            PositionCreate(
                record_id="R1", entity="E", flow_type="AR",
                currency="US", amount=100, value_date="2026-01-01",
            )

    def test_invalid_value_date_format(self):
        with pytest.raises(ValidationError):
            PositionCreate(
                record_id="R1", entity="E", flow_type="AR",
                currency="USD", amount=100, value_date="01-01-2026",
            )

    def test_invalid_status(self):
        with pytest.raises(ValidationError):
            PositionCreate(
                record_id="R1", entity="E", flow_type="AR",
                currency="USD", amount=100, value_date="2026-01-01",
                status="PENDING",
            )

    def test_forecast_status(self):
        p = PositionCreate(
            record_id="R1", entity="E", flow_type="AR",
            currency="USD", amount=100, value_date="2026-01-01",
            status="FORECAST",
        )
        assert p.status == "FORECAST"

    def test_record_id_empty(self):
        with pytest.raises(ValidationError):
            PositionCreate(
                record_id="", entity="E", flow_type="AR",
                currency="USD", amount=100, value_date="2026-01-01",
            )

    def test_description_too_long(self):
        with pytest.raises(ValidationError):
            PositionCreate(
                record_id="R1", entity="E", flow_type="AR",
                currency="USD", amount=100, value_date="2026-01-01",
                description="x" * 513,
            )


class TestPositionUpdate:
    def test_all_none(self):
        pu = PositionUpdate()
        assert pu.entity is None
        assert pu.flow_type is None
        assert pu.currency is None

    def test_partial(self):
        pu = PositionUpdate(amount=200.0, currency="eur")
        assert pu.currency == "EUR"
        assert pu.amount == 200.0

    def test_currency_none_passthrough(self):
        pu = PositionUpdate()
        assert pu.currency is None

    def test_invalid_flow_type(self):
        with pytest.raises(ValidationError):
            PositionUpdate(flow_type="BOTH")


class TestAssignPolicyRequest:
    def test_valid(self):
        uid = uuid.uuid4()
        req = AssignPolicyRequest(policy_instance_id=uid)
        assert req.policy_instance_id == uid

    def test_missing(self):
        with pytest.raises(ValidationError):
            AssignPolicyRequest()


class TestBulkAssignPolicyRequest:
    def test_valid(self):
        ids = [uuid.uuid4() for _ in range(3)]
        req = BulkAssignPolicyRequest(position_ids=ids, policy_instance_id=uuid.uuid4())
        assert len(req.position_ids) == 3

    def test_empty_positions(self):
        with pytest.raises(ValidationError):
            BulkAssignPolicyRequest(position_ids=[], policy_instance_id=uuid.uuid4())

    def test_max_exceeded(self):
        ids = [uuid.uuid4() for _ in range(501)]
        with pytest.raises(ValidationError):
            BulkAssignPolicyRequest(position_ids=ids, policy_instance_id=uuid.uuid4())


class TestBulkAssignResult:
    def test_defaults(self):
        r = BulkAssignResult(assigned=5, skipped=2, failed=0)
        assert r.errors == []


class TestReadyToExecuteRequest:
    def test_valid(self):
        req = ReadyToExecuteRequest(run_id="run-abc")
        assert req.hedge_amount is None
        assert req.hedge_rate is None

    def test_with_amounts(self):
        req = ReadyToExecuteRequest(run_id="run-abc", hedge_amount=50000, hedge_rate=17.5)
        assert req.hedge_amount == 50000

    def test_zero_hedge_amount(self):
        with pytest.raises(ValidationError):
            ReadyToExecuteRequest(run_id="run-abc", hedge_amount=0)

    def test_empty_run_id(self):
        with pytest.raises(ValidationError):
            ReadyToExecuteRequest(run_id="")


class TestExecutePositionRequest:
    def test_valid(self):
        req = ExecutePositionRequest(execution_ref="IBKR-12345")
        assert req.hedge_amount is None

    def test_empty_ref(self):
        with pytest.raises(ValidationError):
            ExecutePositionRequest(execution_ref="")


class TestRejectPositionRequest:
    def test_valid(self):
        req = RejectPositionRequest(reason="Exceeds risk limits for this quarter")
        assert len(req.reason) > 5

    def test_reason_too_short(self):
        with pytest.raises(ValidationError):
            RejectPositionRequest(reason="No")

    def test_reason_too_long(self):
        with pytest.raises(ValidationError):
            RejectPositionRequest(reason="x" * 513)


class TestPositionResponse:
    def test_defaults(self):
        now = datetime.now(timezone.utc)
        uid = uuid.uuid4()
        resp = PositionResponse(
            id=uid, company_id=uuid.uuid4(), created_by=uuid.uuid4(),
            record_id="R1", entity="E", flow_type="AR",
            currency="USD", amount=100, value_date="2026-01-01",
            status="CONFIRMED", is_active=True, created_at=now, updated_at=now,
        )
        assert resp.execution_status == "NEW"
        assert resp.policy_id is None
        assert resp.hedge_amount is None
        assert resp.rejection_reason is None


class TestPositionListResponse:
    def test_empty(self):
        pl = PositionListResponse(items=[], total=0)
        assert pl.total == 0


class TestExposureAggregation:
    def test_valid(self):
        ea = ExposureAggregation(
            currency="MXN",
            total_confirmed=500000,
            total_forecast=200000,
            count_confirmed=3,
            count_forecast=2,
        )
        assert ea.count_confirmed == 3


# ---------------------------------------------------------------------------
# results.py
# ---------------------------------------------------------------------------
from app.schemas_v1.results import (
    BucketResult,
    CalculateRequest,
    CalculateResponse,
    GenericBucketResult,
    GenericHedgePlan,
    GenericHedgePlanSummary,
    HedgePlan,
    HedgePlanSummary,
    RunEnvelope,
    ScenarioBucketResult,
    ScenarioResults,
    ScenarioTotalResult,
    TraceEvent,
    TraceLite,
    ValidationReport,
)
from app.schemas_v1.errors import Severity, ValidationErrorDetail


class TestValidationErrorDetail:
    def test_valid(self):
        e = ValidationErrorDetail(
            code="E001", field="spot_rate",
            message="Spot rate missing", severity=Severity.CRITICAL,
        )
        assert e.severity == Severity.CRITICAL

    def test_warning_severity(self):
        e = ValidationErrorDetail(
            code="W001", field="vol", message="Low vol",
            severity=Severity.WARNING,
        )
        assert e.severity.value == "WARNING"


class TestValidationReport:
    def test_pass(self):
        vr = ValidationReport(status="PASS", errors=[], warnings=[])
        assert vr.status == "PASS"

    def test_fail_with_errors(self):
        err = ValidationErrorDetail(
            code="E001", field="spot", message="missing", severity=Severity.CRITICAL,
        )
        vr = ValidationReport(status="FAIL", errors=[err], warnings=["low data"])
        assert len(vr.errors) == 1
        assert len(vr.warnings) == 1

    def test_invalid_status_literal(self):
        with pytest.raises(ValidationError):
            ValidationReport(status="MAYBE", errors=[], warnings=[])


class TestBucketResult:
    def test_valid(self):
        br = BucketResult(
            bucket="2026-01", confirmed_flow_mxn=100, forecast_flow_mxn=50,
            commercial_exposure_mxn=150, existing_hedges_mxn=0,
            target_signed_mxn=120, action_mxn=120, action_direction="BUY",
            forward_rate=17.5, carry_note="", action_usd=6857,
            friction_usd=10, suppressed=False, hedge_position_mxn=120,
            residual_mxn=30,
        )
        assert br.action_direction == "BUY"

    def test_action_direction_none(self):
        br = BucketResult(
            bucket="2026-02", confirmed_flow_mxn=0, forecast_flow_mxn=0,
            commercial_exposure_mxn=0, existing_hedges_mxn=0,
            target_signed_mxn=0, action_mxn=0, action_direction=None,
            forward_rate=17.5, carry_note="flat", action_usd=0,
            friction_usd=0, suppressed=True, hedge_position_mxn=0,
            residual_mxn=0,
        )
        assert br.action_direction is None


class TestHedgePlanSummary:
    def test_valid(self):
        s = HedgePlanSummary(
            total_commercial_exposure_mxn=1000, total_existing_hedges_mxn=500,
            total_action_mxn=500, total_action_usd=28.57,
            total_friction_usd=2, total_hedge_position_mxn=500,
            total_residual_mxn=500,
        )
        assert s.total_action_mxn == 500


class TestHedgePlan:
    def test_valid(self):
        summary = HedgePlanSummary(
            total_commercial_exposure_mxn=0, total_existing_hedges_mxn=0,
            total_action_mxn=0, total_action_usd=0,
            total_friction_usd=0, total_hedge_position_mxn=0,
            total_residual_mxn=0,
        )
        hp = HedgePlan(buckets=[], summary=summary)
        assert hp.buckets == []


class TestScenarioResults:
    def test_valid(self):
        sb = ScenarioBucketResult(
            bucket="2026-01", sigma=-2.0, shocked_spot=18.0,
            unhedged_usd=-1000, hedged_usd=-500, hedge_benefit_usd=500,
        )
        st = ScenarioTotalResult(
            sigma=-2.0, shocked_spot=18.0, total_unhedged_usd=-1000,
            total_hedged_usd=-500, total_hedge_benefit_usd=500,
        )
        sr = ScenarioResults(sigmas=[-2.0, -1.0, 0, 1.0, 2.0], per_bucket=[sb], totals=[st])
        assert len(sr.sigmas) == 5


class TestRunEnvelope:
    def test_minimal(self):
        now = datetime.now(timezone.utc)
        re = RunEnvelope(
            run_id="run-1", timestamp=now, engine_version="1.0.0",
            inputs_hash="i", outputs_hash="o", run_hash="r",
            trades_hash="t", hedges_hash="h",
            market_hash="m", policy_hash="p",
        )
        assert re.market_snapshot_id is None
        assert re.market_is_synthetic_forward is None


class TestTraceEvent:
    def test_defaults(self):
        now = datetime.now(timezone.utc)
        te = TraceEvent(step="validate", timestamp=now, detail="OK")
        assert te.data == {}


class TestCalculateRequest:
    def test_valid(self):
        req = CalculateRequest(
            trades=[{"record_id": "T1"}],
            market={"spot_rate": 17.0},
            policy={"hedge_ratios": {}},
        )
        assert req.hedges == []
        assert req.market_snapshot_id is None

    def test_missing_trades(self):
        with pytest.raises(ValidationError):
            CalculateRequest(market={}, policy={})


class TestGenericBucketResult:
    def test_to_legacy_bucket(self):
        gb = GenericBucketResult(
            bucket="2026-01", pair="USDMXN", local_ccy="MXN",
            confirmed_flow_local=100, forecast_flow_local=50,
            commercial_exposure_local=150, existing_hedges_local=0,
            target_signed_local=120, action_local=120, action_direction="BUY",
            forward_rate=17.5, carry_note="", action_usd=6857,
            friction_usd=10, suppressed=False,
            hedge_position_local=120, residual_local=30,
        )
        legacy = gb.to_legacy_bucket()
        assert isinstance(legacy, BucketResult)
        assert legacy.confirmed_flow_mxn == 100
        assert legacy.action_mxn == 120


class TestGenericHedgePlan:
    def test_to_legacy_plan(self):
        summary = GenericHedgePlanSummary(
            pair="USDMXN", local_ccy="MXN",
            total_commercial_exposure_local=1000, total_existing_hedges_local=0,
            total_action_local=1000, total_action_usd=57.14,
            total_friction_usd=5, total_hedge_position_local=1000,
            total_residual_local=0,
        )
        gp = GenericHedgePlan(pair="USDMXN", local_ccy="MXN", buckets=[], summary=summary)
        legacy = gp.to_legacy_plan()
        assert isinstance(legacy, HedgePlan)
        assert legacy.summary.total_action_mxn == 1000


# ---------------------------------------------------------------------------
# market.py
# ---------------------------------------------------------------------------
from app.schemas_v1.market import (
    MarketSnapshot,
    MultiCurrencyMarketSnapshot,
    PairMarketData,
)


class TestMarketSnapshot:
    def test_valid(self):
        now = datetime.now(timezone.utc)
        ms = MarketSnapshot(
            as_of=now, spot_rate=17.25,
            forward_points_by_month={"2026-01": 0.05, "2026-02": 0.10},
        )
        assert ms.provider_metadata == {}

    def test_zero_spot_rejected(self):
        with pytest.raises(ValidationError):
            MarketSnapshot(
                as_of=datetime.now(timezone.utc), spot_rate=0,
                forward_points_by_month={},
            )

    def test_negative_spot_rejected(self):
        with pytest.raises(ValidationError):
            MarketSnapshot(
                as_of=datetime.now(timezone.utc), spot_rate=-1,
                forward_points_by_month={},
            )


class TestPairMarketData:
    def test_defaults(self):
        pmd = PairMarketData(spot=1.08)
        assert pmd.forward_points_by_month == {}
        assert pmd.bid_ask_spread_bps == 0.0
        assert pmd.adv_usd is None
        assert pmd.vol_surface == {}
        assert pmd.margin_rates == {}

    def test_zero_spot_rejected(self):
        with pytest.raises(ValidationError):
            PairMarketData(spot=0)

    def test_negative_spread_rejected(self):
        with pytest.raises(ValidationError):
            PairMarketData(spot=1.08, bid_ask_spread_bps=-1)


class TestMultiCurrencyMarketSnapshot:
    def test_inherits_market_snapshot(self):
        now = datetime.now(timezone.utc)
        ms = MultiCurrencyMarketSnapshot(
            as_of=now, spot_rate=17.25,
            forward_points_by_month={"2026-01": 0.05},
        )
        assert ms.pairs == {}

    def test_get_spot_usdmxn_fallback(self):
        now = datetime.now(timezone.utc)
        ms = MultiCurrencyMarketSnapshot(
            as_of=now, spot_rate=17.25,
            forward_points_by_month={"2026-01": 0.05},
        )
        assert ms.get_spot("USDMXN") == 17.25

    def test_get_spot_other_pair(self):
        now = datetime.now(timezone.utc)
        ms = MultiCurrencyMarketSnapshot(
            as_of=now, spot_rate=17.25,
            forward_points_by_month={},
            pairs={"EURUSD": PairMarketData(spot=1.08)},
        )
        assert ms.get_spot("EURUSD") == 1.08

    def test_get_spot_missing_pair(self):
        now = datetime.now(timezone.utc)
        ms = MultiCurrencyMarketSnapshot(
            as_of=now, spot_rate=17.25,
            forward_points_by_month={},
        )
        with pytest.raises(ValueError, match="No market data for pair"):
            ms.get_spot("GBPUSD")

    def test_get_forward_points_usdmxn(self):
        now = datetime.now(timezone.utc)
        ms = MultiCurrencyMarketSnapshot(
            as_of=now, spot_rate=17.25,
            forward_points_by_month={"2026-01": 0.05},
        )
        assert ms.get_forward_points("USDMXN") == {"2026-01": 0.05}

    def test_get_forward_points_other_pair(self):
        now = datetime.now(timezone.utc)
        ms = MultiCurrencyMarketSnapshot(
            as_of=now, spot_rate=17.25,
            forward_points_by_month={},
            pairs={"EURUSD": PairMarketData(spot=1.08, forward_points_by_month={"2026-06": 0.003})},
        )
        assert ms.get_forward_points("EURUSD") == {"2026-06": 0.003}

    def test_get_forward_points_missing_pair(self):
        now = datetime.now(timezone.utc)
        ms = MultiCurrencyMarketSnapshot(
            as_of=now, spot_rate=17.25,
            forward_points_by_month={},
        )
        with pytest.raises(ValueError, match="No market data for pair"):
            ms.get_forward_points("USDJPY")


# ---------------------------------------------------------------------------
# organization.py
# ---------------------------------------------------------------------------
from app.schemas.organization import (
    BranchBase,
    BranchCreate,
    BranchOut,
    BranchUpdate,
    BranchWithDepartments,
    CompanyBase,
    CompanyCreate,
    CompanyOut,
    CompanyUpdate,
    CompanyWithBranches,
    DepartmentBase,
    DepartmentCreate,
    DepartmentOut,
    DepartmentUpdate,
)


class TestCompanyBase:
    def test_valid(self):
        c = CompanyBase(name="Acme Corp", slug="acme-corp")
        assert c.domain is None
        assert c.logo_url is None
        assert c.settings == {}

    def test_invalid_slug_pattern(self):
        with pytest.raises(ValidationError):
            CompanyBase(name="Acme", slug="Acme Corp!")

    def test_empty_name(self):
        with pytest.raises(ValidationError):
            CompanyBase(name="", slug="acme")


class TestCompanyCreate:
    def test_inherits_base(self):
        c = CompanyCreate(name="Foo", slug="foo")
        assert isinstance(c, CompanyBase)


class TestCompanyUpdate:
    def test_all_none(self):
        cu = CompanyUpdate()
        assert cu.name is None
        assert cu.domain is None
        assert cu.settings is None

    def test_partial(self):
        cu = CompanyUpdate(name="New Name", domain="new.com")
        assert cu.name == "New Name"


class TestCompanyOut:
    def test_valid(self):
        now = datetime.now(timezone.utc)
        co = CompanyOut(
            id=uuid.uuid4(), name="Test", slug="test",
            is_active=True, created_at=now,
        )
        assert co.is_active is True


class TestBranchBase:
    def test_valid(self):
        b = BranchBase(name="NYC Branch", code="NYC-01")
        assert b.region is None
        assert b.timezone == "UTC"

    def test_invalid_code_pattern(self):
        with pytest.raises(ValidationError):
            BranchBase(name="Test", code="nyc-01")  # lowercase not allowed


class TestBranchCreate:
    def test_inherits_base(self):
        b = BranchCreate(name="Test", code="TST")
        assert isinstance(b, BranchBase)


class TestBranchUpdate:
    def test_all_none(self):
        bu = BranchUpdate()
        assert bu.name is None
        assert bu.is_active is None


class TestBranchOut:
    def test_valid(self):
        now = datetime.now(timezone.utc)
        bo = BranchOut(
            id=uuid.uuid4(), company_id=uuid.uuid4(),
            name="HQ", code="HQ-01",
            is_active=True, created_at=now,
        )
        assert bo.timezone == "UTC"


class TestDepartmentBase:
    def test_valid(self):
        d = DepartmentBase(name="Treasury", code="TREAS")
        assert d.code == "TREAS"

    def test_invalid_code(self):
        with pytest.raises(ValidationError):
            DepartmentBase(name="Treasury", code="treas")  # lowercase


class TestDepartmentCreate:
    def test_inherits_base(self):
        d = DepartmentCreate(name="Risk", code="RISK")
        assert isinstance(d, DepartmentBase)


class TestDepartmentUpdate:
    def test_all_none(self):
        du = DepartmentUpdate()
        assert du.name is None


class TestDepartmentOut:
    def test_valid(self):
        now = datetime.now(timezone.utc)
        do = DepartmentOut(
            id=uuid.uuid4(), branch_id=uuid.uuid4(),
            name="IT", code="IT", created_at=now,
        )
        assert do.name == "IT"


class TestBranchWithDepartments:
    def test_empty_departments(self):
        now = datetime.now(timezone.utc)
        bwd = BranchWithDepartments(
            id=uuid.uuid4(), company_id=uuid.uuid4(),
            name="HQ", code="HQ", is_active=True, created_at=now,
        )
        assert bwd.departments == []


class TestCompanyWithBranches:
    def test_empty_branches(self):
        now = datetime.now(timezone.utc)
        cwb = CompanyWithBranches(
            id=uuid.uuid4(), name="Co", slug="co",
            is_active=True, created_at=now,
        )
        assert cwb.branches == []


# ---------------------------------------------------------------------------
# rbac.py
# ---------------------------------------------------------------------------
from app.schemas.rbac import (
    AssignRoleRequest,
    PaginatedUsersResponse,
    RemoveRoleRequest,
    RoleBase,
    RoleCreate,
    RoleOut,
    RoleUpdate,
    RolesListResponse,
    UserRoleOut,
    UserWithRoles,
)


class TestRoleBase:
    def test_valid(self):
        r = RoleBase(name="admin")
        assert r.description is None

    def test_name_too_short(self):
        with pytest.raises(ValidationError):
            RoleBase(name="x")

    def test_name_too_long(self):
        with pytest.raises(ValidationError):
            RoleBase(name="a" * 65)


class TestRoleCreate:
    def test_inherits(self):
        r = RoleCreate(name="manager", description="Manages things")
        assert isinstance(r, RoleBase)


class TestRoleUpdate:
    def test_defaults(self):
        ru = RoleUpdate()
        assert ru.description is None

    def test_description_too_long(self):
        with pytest.raises(ValidationError):
            RoleUpdate(description="x" * 256)


class TestRoleOut:
    def test_valid(self):
        now = datetime.now(timezone.utc)
        ro = RoleOut(id=1, name="admin", created_at=now, updated_at=now)
        assert ro.description is None


class TestUserRoleOut:
    def test_valid(self):
        now = datetime.now(timezone.utc)
        uro = UserRoleOut(id=1, user_id=10, role_id=3, created_at=now)
        assert uro.role_id == 3


class TestAssignRoleRequest:
    def test_valid(self):
        ar = AssignRoleRequest(role_name="admin")
        assert ar.role_name == "admin"

    def test_too_short(self):
        with pytest.raises(ValidationError):
            AssignRoleRequest(role_name="x")


class TestRemoveRoleRequest:
    def test_valid(self):
        rr = RemoveRoleRequest(role_name="viewer")
        assert rr.role_name == "viewer"

    def test_too_short(self):
        with pytest.raises(ValidationError):
            RemoveRoleRequest(role_name="a")


class TestUserWithRoles:
    def test_valid(self):
        uw = UserWithRoles(id=1, email="test@example.com", is_active=True)
        assert uw.roles == []

    def test_with_roles(self):
        uw = UserWithRoles(id=1, email="test@example.com", is_active=True, roles=["admin", "user"])
        assert len(uw.roles) == 2


class TestPaginatedUsersResponse:
    def test_valid(self):
        pu = PaginatedUsersResponse(items=[], total=0, page=1, size=10, pages=1)
        assert pu.total == 0

    def test_negative_total(self):
        with pytest.raises(ValidationError):
            PaginatedUsersResponse(items=[], total=-1, page=1, size=10, pages=1)

    def test_zero_page(self):
        with pytest.raises(ValidationError):
            PaginatedUsersResponse(items=[], total=0, page=0, size=10, pages=1)

    def test_zero_size(self):
        with pytest.raises(ValidationError):
            PaginatedUsersResponse(items=[], total=0, page=1, size=0, pages=1)

    def test_zero_pages(self):
        with pytest.raises(ValidationError):
            PaginatedUsersResponse(items=[], total=0, page=1, size=10, pages=0)


class TestRolesListResponse:
    def test_empty(self):
        rl = RolesListResponse(items=[])
        assert rl.items == []


# ---------------------------------------------------------------------------
# api_key.py
# ---------------------------------------------------------------------------
from app.models.api_key import ApiKeyStatus
from app.schemas.api_key import (
    ApiKeyBase,
    ApiKeyCreateRequest,
    ApiKeyListResponse,
    ApiKeyPublic,
    ApiKeyRotateRequest,
    ApiKeySecretResponse,
    ApiKeyVerifyHeader,
)


class TestApiKeyStatus:
    def test_enum_values(self):
        assert ApiKeyStatus.ACTIVE.value == "active"
        assert ApiKeyStatus.REVOKED.value == "revoked"
        assert ApiKeyStatus.EXPIRED.value == "expired"


class TestApiKeyBase:
    def test_valid(self):
        akb = ApiKeyBase(key_id="key123", status=ApiKeyStatus.ACTIVE)
        assert akb.name is None
        assert akb.scopes == []
        assert akb.owner_user_id is None
        assert akb.created_at is None
        assert akb.last_used_at is None
        assert akb.expires_at is None


class TestApiKeyCreateRequest:
    def test_defaults(self):
        req = ApiKeyCreateRequest()
        assert req.name is None
        assert req.scopes == []
        assert req.owner_user_id is None
        assert req.expires_at is None

    def test_with_values(self):
        uid = uuid.uuid4()
        now = datetime.now(timezone.utc)
        req = ApiKeyCreateRequest(
            name="Market Data Svc",
            scopes=["read:quotes", "write:orders"],
            owner_user_id=uid,
            expires_at=now,
        )
        assert len(req.scopes) == 2
        assert req.owner_user_id == uid


class TestApiKeyRotateRequest:
    def test_defaults(self):
        req = ApiKeyRotateRequest()
        assert req.name is None
        assert req.expires_at is None


class TestApiKeyPublic:
    def test_valid(self):
        now = datetime.now(timezone.utc)
        akp = ApiKeyPublic(
            id=uuid.uuid4(), key_id="k1",
            status=ApiKeyStatus.ACTIVE, created_at=now,
        )
        assert akp.name is None
        assert akp.scopes == []

    def test_revoked_status(self):
        now = datetime.now(timezone.utc)
        akp = ApiKeyPublic(
            id=uuid.uuid4(), key_id="k2",
            status=ApiKeyStatus.REVOKED, created_at=now,
        )
        assert akp.status == ApiKeyStatus.REVOKED


class TestApiKeySecretResponse:
    def test_valid(self):
        resp = ApiKeySecretResponse(
            key_id="abc123",
            token="HK_live_abc123.xyzSecretValue1234567890",
        )
        assert resp.token.startswith("HK_live_")
        assert resp.expires_at is None


class TestApiKeyListResponse:
    def test_valid(self):
        resp = ApiKeyListResponse(total=0, items=[])
        assert resp.total == 0


class TestApiKeyVerifyHeader:
    def test_valid_format(self):
        h = ApiKeyVerifyHeader(x_api_key="HK_live_8F2k3bC7zL.sR4TxQm1u9vWyzD8hPnJ5cK2aR")
        assert h.x_api_key.startswith("HK_live_")

    def test_invalid_prefix(self):
        with pytest.raises(ValidationError):
            ApiKeyVerifyHeader(x_api_key="INVALID_8F2k3bC7zL.sR4TxQm1u9vWyzD8hPnJ5cK2aR")

    def test_missing_dot_separator(self):
        with pytest.raises(ValidationError):
            ApiKeyVerifyHeader(x_api_key="HK_live_8F2k3bC7zLsR4TxQm1u9vWyzD8hPnJ5cK2aR")

    def test_secret_too_short(self):
        with pytest.raises(ValidationError):
            ApiKeyVerifyHeader(x_api_key="HK_live_abc.short")


# ---------------------------------------------------------------------------
# Serialization round-trip tests
# ---------------------------------------------------------------------------
class TestSerializationRoundTrips:
    def test_waterfall_rule_dict_roundtrip(self):
        r = WaterfallRule(rule_id="R1", name="test", status=WaterfallRuleStatus.PASS)
        d = r.model_dump()
        r2 = WaterfallRule(**d)
        assert r2.rule_id == r.rule_id
        assert r2.status == r.status

    def test_position_create_json_roundtrip(self):
        p = PositionCreate(
            record_id="R1", entity="E", flow_type="AR",
            currency="USD", amount=100, value_date="2026-01-01",
        )
        json_str = p.model_dump_json()
        p2 = PositionCreate.model_validate_json(json_str)
        assert p2.record_id == p.record_id
        assert p2.currency == "USD"

    def test_freeze_artifact_dict_roundtrip(self):
        fa = FreezeArtifact(
            snapshot_hash="h", exposure_digest="d", policy_hash="p",
            engine_version="1.0.0", hedge_plan={"x": 1}, scenario_results={"y": 2},
            waterfall_result={"z": 3}, residual_risk_vector=[0.1, 0.2, 0.3],
            capability_flags={"netting": True},
        )
        d = fa.model_dump()
        fa2 = FreezeArtifact(**d)
        assert fa2.residual_risk_vector == [0.1, 0.2, 0.3]
        assert fa2.capability_flags == {"netting": True}

    def test_market_snapshot_json_roundtrip(self):
        now = datetime.now(timezone.utc)
        ms = MarketSnapshot(
            as_of=now, spot_rate=17.25,
            forward_points_by_month={"2026-01": 0.05},
            provider_metadata={"source": "bloomberg"},
        )
        json_str = ms.model_dump_json()
        ms2 = MarketSnapshot.model_validate_json(json_str)
        assert ms2.spot_rate == 17.25
        assert ms2.provider_metadata["source"] == "bloomberg"

    def test_company_base_dict_roundtrip(self):
        c = CompanyBase(
            name="Acme", slug="acme", domain="acme.com",
            settings={"theme": "dark"},
        )
        d = c.model_dump()
        c2 = CompanyBase(**d)
        assert c2.settings == {"theme": "dark"}

    def test_role_out_dict_roundtrip(self):
        now = datetime.now(timezone.utc)
        ro = RoleOut(id=1, name="admin", description="Administrator", created_at=now, updated_at=now)
        d = ro.model_dump()
        ro2 = RoleOut(**d)
        assert ro2.name == "admin"
        assert ro2.description == "Administrator"
