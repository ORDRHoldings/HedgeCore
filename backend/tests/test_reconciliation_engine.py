"""Pure-function tests for the reconciliation matching engine.

No DB, no mocks, no async — just input → output verification.
"""
import uuid
from datetime import date
from decimal import Decimal
import pytest


def _tx(amount, currency="EUR", tx_date=date(2026, 4, 1), direction="CREDIT", tx_id=None):
    return {
        "id": tx_id or uuid.uuid4(),
        "amount": Decimal(str(amount)),
        "currency": currency,
        "tx_date": tx_date,
        "value_date": None,
        "direction": direction,
        "reference": "",
    }


def _settlement(amount, currency="EUR", settlement_date=date(2026, 4, 1), se_id=None, value_date=None):
    return {
        "id": se_id or uuid.uuid4(),
        "settlement_amount": Decimal(str(amount)),
        "currency": currency,
        "settlement_date": settlement_date,
        "value_date": value_date,
        "settlement_ref": "REF001",
    }


def _journal(amount, currency="EUR", period_date=date(2026, 4, 1), je_id=None):
    return {
        "id": je_id or uuid.uuid4(),
        "amount": Decimal(str(amount)),
        "currency": currency,
        "period_date": period_date,
        "description": "Journal entry",
    }


def test_exact_settlement_match():
    """Transaction matches settlement on amount + currency + date."""
    from app.services.reconciliation_engine import find_matches

    tx_id = uuid.uuid4()
    se_id = uuid.uuid4()
    tx = _tx(50000, tx_id=tx_id)
    se = _settlement(50000, se_id=se_id)

    matches = find_matches([tx], [se], [])
    assert len(matches) == 1
    assert matches[0]["transaction_id"] == tx_id
    assert matches[0]["match_type"] == "SETTLEMENT"
    assert matches[0]["matched_id"] == se_id


def test_exact_journal_match():
    """Transaction matches journal on amount + currency + date."""
    from app.services.reconciliation_engine import find_matches

    tx_id = uuid.uuid4()
    je_id = uuid.uuid4()
    tx = _tx(15000, tx_id=tx_id)
    je = _journal(15000, je_id=je_id)

    matches = find_matches([tx], [], [je])
    assert len(matches) == 1
    assert matches[0]["match_type"] == "JOURNAL"
    assert matches[0]["matched_id"] == je_id


def test_no_match_different_amount():
    """No match when amounts differ."""
    from app.services.reconciliation_engine import find_matches

    tx = _tx(50000)
    se = _settlement(49999)

    matches = find_matches([tx], [se], [])
    assert len(matches) == 0


def test_no_match_different_currency():
    """No match when currencies differ."""
    from app.services.reconciliation_engine import find_matches

    tx = _tx(50000, currency="EUR")
    se = _settlement(50000, currency="USD")

    matches = find_matches([tx], [se], [])
    assert len(matches) == 0


def test_multi_candidate_ambiguity_skipped():
    """Multiple candidates with same amount+currency+date → no match (ambiguity)."""
    from app.services.reconciliation_engine import find_matches

    tx = _tx(50000)
    se1 = _settlement(50000)
    se2 = _settlement(50000)

    matches = find_matches([tx], [se1, se2], [])
    assert len(matches) == 0


def test_settlement_priority_over_journal():
    """When both settlement and journal match, settlement wins."""
    from app.services.reconciliation_engine import find_matches

    tx_id = uuid.uuid4()
    se_id = uuid.uuid4()
    je_id = uuid.uuid4()
    tx = _tx(25000, tx_id=tx_id)
    se = _settlement(25000, se_id=se_id)
    je = _journal(25000, je_id=je_id)

    matches = find_matches([tx], [se], [je])
    assert len(matches) == 1
    assert matches[0]["match_type"] == "SETTLEMENT"
    assert matches[0]["matched_id"] == se_id


def test_settlement_match_on_value_date():
    """Settlement matches when tx_date matches settlement value_date."""
    from app.services.reconciliation_engine import find_matches

    tx_id = uuid.uuid4()
    se_id = uuid.uuid4()
    tx = _tx(30000, tx_date=date(2026, 4, 3), tx_id=tx_id)
    se = _settlement(30000, settlement_date=date(2026, 4, 1), value_date=date(2026, 4, 3), se_id=se_id)

    matches = find_matches([tx], [se], [])
    assert len(matches) == 1
    assert matches[0]["matched_id"] == se_id


def test_empty_inputs():
    """Empty inputs return empty matches."""
    from app.services.reconciliation_engine import find_matches

    assert find_matches([], [], []) == []
    assert find_matches([_tx(100)], [], []) == []
    assert find_matches([], [_settlement(100)], [_journal(100)]) == []


def test_already_matched_settlement_not_reused():
    """A settlement already matched to one tx is not available for another."""
    from app.services.reconciliation_engine import find_matches

    se_id = uuid.uuid4()
    tx1 = _tx(50000, tx_date=date(2026, 4, 1))
    tx2 = _tx(50000, tx_date=date(2026, 4, 1))
    se = _settlement(50000, se_id=se_id)

    # Two txs with same amount/currency/date, one settlement →
    # both would match, but settlement can only be used once.
    # First match consumes the settlement; second gets no match.
    matches = find_matches([tx1, tx2], [se], [])
    assert len(matches) == 1
