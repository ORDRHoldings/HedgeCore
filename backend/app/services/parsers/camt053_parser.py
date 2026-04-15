"""
Pure-function CAMT.053 (ISO 20022) bank statement parser.

Deterministic. No DB access. No side effects.
Uses xml.etree.ElementTree (stdlib). Strips namespace for cross-version compat.
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from datetime import date
from decimal import Decimal

from app.services.parsers.statement_types import ParsedStatement, ParsedTransaction


def parse_camt053(content: str) -> list[ParsedStatement]:
    """Parse CAMT.053 XML content into a list of ParsedStatement objects."""
    content = content.strip()
    if not content:
        return []

    # Strip namespace prefixes for compatibility
    cleaned = re.sub(r'\sxmlns="[^"]*"', "", content, count=1)

    try:
        root = ET.fromstring(cleaned)
    except ET.ParseError:
        return []

    statements: list[ParsedStatement] = []

    for stmt_el in root.iter("Stmt"):
        stmt = _parse_stmt(stmt_el)
        if stmt:
            statements.append(stmt)

    return statements


def _parse_stmt(stmt_el: ET.Element) -> ParsedStatement | None:
    """Parse a single <Stmt> element."""
    # Account identification
    account_id = ""
    acct = stmt_el.find(".//Acct/Id")
    if acct is not None:
        iban = acct.find("IBAN")
        if iban is not None and iban.text:
            account_id = iban.text.strip()
        else:
            othr = acct.find("Othr/Id")
            if othr is not None and othr.text:
                account_id = othr.text.strip()

    # Currency
    ccy_el = stmt_el.find(".//Acct/Ccy")
    currency = ccy_el.text.strip() if ccy_el is not None and ccy_el.text else "EUR"

    # Balances
    opening = Decimal("0")
    closing = Decimal("0")
    stmt_date = date.today()

    for bal in stmt_el.findall("Bal"):
        bal_type = ""
        cd = bal.find("Tp/CdOrPrtry/Cd")
        if cd is not None and cd.text:
            bal_type = cd.text.strip()

        amt_el = bal.find("Amt")
        if amt_el is not None and amt_el.text:
            amt = Decimal(amt_el.text.strip())
            cdt_dbt = bal.find("CdtDbtInd")
            if cdt_dbt is not None and cdt_dbt.text and cdt_dbt.text.strip() == "DBIT":
                amt = -amt

            if bal_type == "OPBD":
                opening = amt
            elif bal_type == "CLBD":
                closing = amt
                dt_el = bal.find("Dt/Dt")
                if dt_el is not None and dt_el.text:
                    stmt_date = date.fromisoformat(dt_el.text.strip())

    # Transactions
    transactions: list[ParsedTransaction] = []
    for ntry in stmt_el.findall("Ntry"):
        tx = _parse_entry(ntry)
        if tx:
            transactions.append(tx)

    if not account_id:
        return None

    return ParsedStatement(
        account_identifier=account_id,
        statement_date=stmt_date,
        opening_balance=opening,
        closing_balance=closing,
        currency=currency,
        transactions=transactions,
    )


def _parse_entry(ntry: ET.Element) -> ParsedTransaction | None:
    """Parse a single <Ntry> element into a ParsedTransaction."""
    # Amount
    amt_el = ntry.find("Amt")
    if amt_el is None or not amt_el.text:
        return None
    amount = Decimal(amt_el.text.strip())

    # Direction
    cdi = ntry.find("CdtDbtInd")
    direction = "CREDIT"
    if cdi is not None and cdi.text and cdi.text.strip() == "DBIT":
        direction = "DEBIT"

    # Dates
    tx_date = date.today()
    bookg = ntry.find("BookgDt/Dt")
    if bookg is not None and bookg.text:
        tx_date = date.fromisoformat(bookg.text.strip())

    value_date = None
    val = ntry.find("ValDt/Dt")
    if val is not None and val.text:
        value_date = date.fromisoformat(val.text.strip())

    # Details
    description = ""
    reference = ""
    ustrd = ntry.find(".//RmtInf/Ustrd")
    if ustrd is not None and ustrd.text:
        description = ustrd.text.strip()

    e2e = ntry.find(".//Refs/EndToEndId")
    if e2e is not None and e2e.text:
        reference = e2e.text.strip()

    return ParsedTransaction(
        tx_date=tx_date,
        value_date=value_date,
        amount=amount,
        direction=direction,
        description=description,
        reference=reference,
        counterparty="",
        tx_code="",
    )
