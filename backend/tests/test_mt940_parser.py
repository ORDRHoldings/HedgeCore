"""Pure-function tests for the MT940 bank statement parser.

No DB, no mocks, no async — just input -> output verification.
"""
from datetime import date
from decimal import Decimal
import pytest


SAMPLE_MT940 = """\
{1:F01BANKBEBB0000000000}{2:O9400000000000BANKBEBB0000000000000000000000N}{4:
:20:STMT202604
:25:BE68539007547034
:28C:1/1
:60F:C260401EUR1000000,00
:61:2604010401C50000,00N051NONREF
:86:Payment from Client ABC
:61:2604020402D12000,00N020NONREF
:86:Supplier payment XYZ Corp
:62F:C260402EUR1038000,00
-}
"""

SAMPLE_MT940_MULTI = """\
{1:F01BANKBEBB0000000000}{2:O9400000000000BANKBEBB0000000000000000000000N}{4:
:20:STMT1
:25:DE89370400440532013000
:28C:1/1
:60F:C260401EUR500000,00
:61:2604010401C10000,00N051NONREF
:86:Deposit
:62F:C260401EUR510000,00
-}{1:F01BANKBEBB0000000000}{2:O9400000000000BANKBEBB0000000000000000000000N}{4:
:20:STMT2
:25:DE89370400440532013000
:28C:2/1
:60F:C260401EUR510000,00
:62F:C260401EUR510000,00
-}
"""


def test_parse_single_statement():
    """Parse a simple MT940 with 2 transactions."""
    from app.services.parsers.mt940_parser import parse_mt940

    results = parse_mt940(SAMPLE_MT940)
    assert len(results) == 1
    stmt = results[0]
    assert stmt.account_identifier == "BE68539007547034"
    assert stmt.currency == "EUR"
    assert stmt.opening_balance == Decimal("1000000.00")
    assert stmt.closing_balance == Decimal("1038000.00")
    assert len(stmt.transactions) == 2

    # First transaction: credit
    tx0 = stmt.transactions[0]
    assert tx0.direction == "CREDIT"
    assert tx0.amount == Decimal("50000.00")
    assert tx0.tx_date == date(2026, 4, 1)
    assert "Client ABC" in tx0.description

    # Second transaction: debit
    tx1 = stmt.transactions[1]
    assert tx1.direction == "DEBIT"
    assert tx1.amount == Decimal("12000.00")
    assert tx1.tx_date == date(2026, 4, 2)


def test_parse_multi_statement():
    """One MT940 file can contain multiple statements."""
    from app.services.parsers.mt940_parser import parse_mt940

    results = parse_mt940(SAMPLE_MT940_MULTI)
    assert len(results) == 2
    assert results[0].opening_balance == Decimal("500000.00")
    assert results[1].opening_balance == Decimal("510000.00")
    assert len(results[0].transactions) == 1
    assert len(results[1].transactions) == 0


def test_parse_reversal_entries():
    """RC (reversal credit) should be treated as DEBIT."""
    from app.services.parsers.mt940_parser import parse_mt940

    mt940 = """\
{4:
:20:REV
:25:NL91ABNA0417164300
:28C:1/1
:60F:C260401EUR100000,00
:61:2604010401RC5000,00N051NONREF
:86:Reversal
:62F:C260401EUR95000,00
-}
"""
    results = parse_mt940(mt940)
    assert len(results) == 1
    tx = results[0].transactions[0]
    assert tx.direction == "DEBIT"
    assert tx.amount == Decimal("5000.00")


def test_parse_empty_content():
    """Empty or whitespace content returns empty list."""
    from app.services.parsers.mt940_parser import parse_mt940

    assert parse_mt940("") == []
    assert parse_mt940("   \n  ") == []
