# backend/tests/test_netting_engine.py
"""Pure-function tests for the intercompany netting engine.

No DB, no mocks, no async — just input → output verification.
"""
import uuid
from decimal import Decimal
import pytest


def _make_obligation(debtor_id, creditor_id, amount, currency="EUR", obl_id=None):
    return {
        "id": obl_id or uuid.uuid4(),
        "debtor_entity_id": debtor_id,
        "creditor_entity_id": creditor_id,
        "amount": Decimal(str(amount)),
        "currency": currency,
    }


def test_simple_bilateral_netting():
    """Two obligations in opposite directions produce one proposal with correct net."""
    from app.services.netting_engine import compute_netting

    a, b = uuid.uuid4(), uuid.uuid4()
    obligations = [
        _make_obligation(a, b, 100_000),
        _make_obligation(b, a, 60_000),
    ]
    proposals = compute_netting(obligations)

    assert len(proposals) == 1
    p = proposals[0]
    assert Decimal(str(p["net_amount"])) == Decimal("40000")
    assert Decimal(str(p["savings"])) == Decimal("60000")
    assert len(p["obligation_ids"]) == 2


def test_same_direction_no_netting():
    """Two obligations in the same direction still net (savings=0 → skipped)."""
    from app.services.netting_engine import compute_netting

    a, b = uuid.uuid4(), uuid.uuid4()
    obligations = [
        _make_obligation(a, b, 100_000),
        _make_obligation(a, b, 50_000),
    ]
    proposals = compute_netting(obligations)
    assert len(proposals) == 0


def test_multi_currency():
    """Obligations in different currencies produce separate proposals."""
    from app.services.netting_engine import compute_netting

    a, b = uuid.uuid4(), uuid.uuid4()
    obligations = [
        _make_obligation(a, b, 100_000, "EUR"),
        _make_obligation(b, a, 60_000, "EUR"),
        _make_obligation(a, b, 200_000, "USD"),
        _make_obligation(b, a, 80_000, "USD"),
    ]
    proposals = compute_netting(obligations)

    assert len(proposals) == 2
    by_ccy = {p["currency"]: p for p in proposals}
    assert Decimal(str(by_ccy["EUR"]["net_amount"])) == Decimal("40000")
    assert Decimal(str(by_ccy["EUR"]["savings"])) == Decimal("60000")
    assert Decimal(str(by_ccy["USD"]["net_amount"])) == Decimal("120000")
    assert Decimal(str(by_ccy["USD"]["savings"])) == Decimal("80000")


def test_many_entity_pairs():
    """Multiple entity pairs produce independent proposals."""
    from app.services.netting_engine import compute_netting

    a, b, c = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    obligations = [
        _make_obligation(a, b, 100_000),
        _make_obligation(b, a, 70_000),
        _make_obligation(a, c, 50_000),
        _make_obligation(c, a, 30_000),
    ]
    proposals = compute_netting(obligations)

    assert len(proposals) == 2
    savings = sorted([Decimal(str(p["savings"])) for p in proposals])
    assert savings == [Decimal("30000"), Decimal("70000")]


def test_net_direction_a2b():
    """When A owes B more than B owes A, direction is A2B."""
    from app.services.netting_engine import compute_netting

    a, b = uuid.uuid4(), uuid.uuid4()
    obligations = [
        _make_obligation(a, b, 100_000),
        _make_obligation(b, a, 40_000),
    ]
    proposals = compute_netting(obligations)

    assert len(proposals) == 1
    p = proposals[0]
    sorted_ids = tuple(sorted([a, b]))
    assert p["entity_a_id"] == sorted_ids[0]
    assert p["entity_b_id"] == sorted_ids[1]
    if sorted_ids[0] == a:
        assert p["net_direction"] == "A2B"
    else:
        assert p["net_direction"] == "B2A"


def test_empty_obligations():
    """Empty input produces empty output."""
    from app.services.netting_engine import compute_netting
    assert compute_netting([]) == []


def test_gross_amounts_correct():
    """Gross payable and gross receivable are calculated correctly."""
    from app.services.netting_engine import compute_netting

    a, b = uuid.uuid4(), uuid.uuid4()
    obligations = [
        _make_obligation(a, b, 60_000),
        _make_obligation(a, b, 40_000),
        _make_obligation(b, a, 30_000),
        _make_obligation(b, a, 25_000),
    ]
    proposals = compute_netting(obligations)

    assert len(proposals) == 1
    p = proposals[0]
    sorted_ids = tuple(sorted([a, b]))
    if sorted_ids[0] == a:
        assert Decimal(str(p["gross_payable"])) == Decimal("100000")
        assert Decimal(str(p["gross_receivable"])) == Decimal("55000")
    else:
        assert Decimal(str(p["gross_payable"])) == Decimal("55000")
        assert Decimal(str(p["gross_receivable"])) == Decimal("100000")
    assert Decimal(str(p["net_amount"])) == Decimal("45000")
    assert Decimal(str(p["savings"])) == Decimal("55000")
    assert len(p["obligation_ids"]) == 4
