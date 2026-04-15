"""Pure-function tests for the BAI2 bank statement parser."""
from datetime import date
from decimal import Decimal
import pytest


SAMPLE_BAI2 = """\
01,BANKID,COMPID,260401,0800,1,80,1,2/
02,BANKID,COMPID,1,260401,0800,EUR,2/
03,123456789,,010,500000,,015,500000,/
16,195,50000,,260401,,REF001,Payment from Client/
16,495,12000,,260402,,REF002,Supplier payment/
49,538000,3/
98,538000,1,3/
99,538000,1,3/
"""


def test_parse_bai2_basic():
    """Parse a simple BAI2 file with 2 transactions."""
    from app.services.parsers.bai2_parser import parse_bai2

    results = parse_bai2(SAMPLE_BAI2)
    assert len(results) == 1
    stmt = results[0]
    assert stmt.account_identifier == "123456789"
    assert stmt.opening_balance == Decimal("5000.00")
    assert len(stmt.transactions) == 2

    tx0 = stmt.transactions[0]
    assert tx0.direction == "CREDIT"
    assert tx0.amount == Decimal("500.00")
    assert "Client" in tx0.description

    tx1 = stmt.transactions[1]
    assert tx1.direction == "DEBIT"
    assert tx1.amount == Decimal("120.00")


def test_parse_bai2_continuation():
    """88 continuation records should be concatenated."""
    from app.services.parsers.bai2_parser import parse_bai2

    bai2 = """\
01,BANKID,COMPID,260401,0800,1,80,1,2/
02,BANKID,COMPID,1,260401,0800,USD,2/
03,9876543210,,010,100000,,/
16,195,25000,,260401,,REF001,First part of/
88,a very long description that continues here/
49,125000,2/
98,125000,1,2/
99,125000,1,2/
"""
    results = parse_bai2(bai2)
    assert len(results) == 1
    assert len(results[0].transactions) == 1
    assert "continues here" in results[0].transactions[0].description


def test_parse_bai2_empty():
    """Empty content returns empty list."""
    from app.services.parsers.bai2_parser import parse_bai2

    assert parse_bai2("") == []
