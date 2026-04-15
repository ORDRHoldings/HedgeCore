"""Pure-function tests for the CAMT.053 bank statement parser."""
from datetime import date
from decimal import Decimal
import pytest


SAMPLE_CAMT053 = """\
<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <Stmt>
      <Acct>
        <Id><IBAN>DE89370400440532013000</IBAN></Id>
        <Ccy>EUR</Ccy>
      </Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">500000.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-04-01</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">535000.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-04-01</Dt></Dt>
      </Bal>
      <Ntry>
        <Amt Ccy="EUR">50000.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-04-01</Dt></BookgDt>
        <ValDt><Dt>2026-04-01</Dt></ValDt>
        <NtryDtls>
          <TxDtls>
            <Refs><EndToEndId>INV-2026-001</EndToEndId></Refs>
            <RmtInf><Ustrd>Payment from Client ABC</Ustrd></RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">15000.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <BookgDt><Dt>2026-04-01</Dt></BookgDt>
        <ValDt><Dt>2026-04-02</Dt></ValDt>
        <NtryDtls>
          <TxDtls>
            <Refs><EndToEndId>SUP-2026-042</EndToEndId></Refs>
            <RmtInf><Ustrd>Supplier payment</Ustrd></RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>
"""


def test_parse_camt053_basic():
    """Parse a CAMT.053 XML with 2 entries."""
    from app.services.parsers.camt053_parser import parse_camt053

    results = parse_camt053(SAMPLE_CAMT053)
    assert len(results) == 1
    stmt = results[0]
    assert stmt.account_identifier == "DE89370400440532013000"
    assert stmt.currency == "EUR"
    assert stmt.opening_balance == Decimal("500000.00")
    assert stmt.closing_balance == Decimal("535000.00")
    assert len(stmt.transactions) == 2

    tx0 = stmt.transactions[0]
    assert tx0.direction == "CREDIT"
    assert tx0.amount == Decimal("50000.00")
    assert tx0.reference == "INV-2026-001"
    assert "Client ABC" in tx0.description

    tx1 = stmt.transactions[1]
    assert tx1.direction == "DEBIT"
    assert tx1.amount == Decimal("15000.00")
    assert tx1.value_date == date(2026, 4, 2)


def test_parse_camt053_account_number_fallback():
    """When IBAN is missing, fall back to Othr/Id."""
    from app.services.parsers.camt053_parser import parse_camt053

    xml = """\
<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <Stmt>
      <Acct><Id><Othr><Id>123456789</Id></Othr></Id><Ccy>USD</Ccy></Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="USD">100000.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-04-01</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="USD">100000.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-04-01</Dt></Dt>
      </Bal>
    </Stmt>
  </BkToCstmrStmt>
</Document>
"""
    results = parse_camt053(xml)
    assert len(results) == 1
    assert results[0].account_identifier == "123456789"
    assert results[0].currency == "USD"


def test_parse_camt053_empty():
    """Empty content returns empty list."""
    from app.services.parsers.camt053_parser import parse_camt053

    assert parse_camt053("") == []
