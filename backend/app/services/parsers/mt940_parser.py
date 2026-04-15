"""
Pure-function MT940 (SWIFT) bank statement parser.

Deterministic. No DB access. No side effects.
Takes raw MT940 content -> returns list of ParsedStatement.
"""
from __future__ import annotations

import re
from datetime import date
from decimal import Decimal

from app.services.parsers.statement_types import ParsedStatement, ParsedTransaction


def parse_mt940(content: str) -> list[ParsedStatement]:
    """Parse MT940 content into a list of ParsedStatement objects.

    One MT940 file may contain multiple statements separated by '-}'.
    """
    content = content.strip()
    if not content:
        return []

    # Split into statement blocks — each ends with '-}'
    blocks = re.split(r"-\}", content)
    statements: list[ParsedStatement] = []

    for block in blocks:
        block = block.strip()
        if not block:
            continue

        # Extract the message body after {4:\n
        match = re.search(r"\{4:\s*\n?(.*)", block, re.DOTALL)
        body = match.group(1) if match else block

        stmt = _parse_block(body)
        if stmt:
            statements.append(stmt)

    return statements


def _parse_block(body: str) -> ParsedStatement | None:
    """Parse a single MT940 statement block."""
    lines = body.split("\n")
    account = ""
    currency = "EUR"
    opening = Decimal("0")
    closing = Decimal("0")
    stmt_date = date.today()
    transactions: list[ParsedTransaction] = []
    current_tx: dict | None = None

    for line in lines:
        line = line.strip()
        if not line:
            continue

        if line.startswith(":25:"):
            account = line[4:].strip()

        elif line.startswith(":60F:") or line.startswith(":60M:"):
            # Format: [C|D]YYMMDDCCCAMOUNT (1 char indicator, 6 date, 3 currency, rest amount)
            raw = line[5:]
            if len(raw) >= 10:
                currency = raw[7:10]
                opening = _parse_amount(raw[10:])

        elif line.startswith(":62F:") or line.startswith(":62M:"):
            # Format: [C|D]YYMMDDCCCAMOUNT
            raw = line[5:]
            if len(raw) >= 10:
                currency = raw[7:10]
                closing = _parse_amount(raw[10:])
                # Extract statement date from closing balance
                date_str = raw[1:7]
                if date_str.isdigit():
                    stmt_date = _parse_date(date_str)

        elif line.startswith(":61:"):
            # Flush previous transaction
            if current_tx:
                transactions.append(_build_tx(current_tx))
            current_tx = _parse_tx_line(line[4:])

        elif line.startswith(":86:"):
            if current_tx:
                current_tx["description"] = line[4:].strip()

    # Flush last transaction
    if current_tx:
        transactions.append(_build_tx(current_tx))

    if not account:
        return None

    return ParsedStatement(
        account_identifier=account,
        statement_date=stmt_date,
        opening_balance=opening,
        closing_balance=closing,
        currency=currency,
        transactions=transactions,
    )


def _parse_tx_line(raw: str) -> dict:
    """Parse a :61: transaction line.

    Format: YYMMDDYYMMDD[C|D|RC|RD]Amount[N]TypeRef
    Example: 2604010401C50000,00N051NONREF
    """
    # Date: first 6 chars (YYMMDD)
    tx_date = _parse_date(raw[:6]) if len(raw) >= 6 else date.today()

    # Value date: next 4 chars (MMDD) — optional
    offset = 6
    value_date = None
    if len(raw) > 10 and raw[6:10].isdigit():
        value_date = _parse_date(raw[:2] + raw[6:10])
        offset = 10

    # Direction: C, D, RC, RD
    direction = "CREDIT"
    if raw[offset:offset + 2] == "RC":
        direction = "DEBIT"  # reversal credit = debit
        offset += 2
    elif raw[offset:offset + 2] == "RD":
        direction = "CREDIT"  # reversal debit = credit
        offset += 2
    elif raw[offset] == "D":
        direction = "DEBIT"
        offset += 1
    elif raw[offset] == "C":
        direction = "CREDIT"
        offset += 1

    # Amount: up to next N or end
    amount_match = re.match(r"([\d,]+)", raw[offset:])
    amount = Decimal("0")
    ref = ""
    if amount_match:
        amount = _parse_amount(amount_match.group(1))
        offset += amount_match.end()

    # Transaction type + reference (after N)
    rest = raw[offset:]
    type_match = re.match(r"N(\w{3})(.*)", rest)
    tx_code = ""
    if type_match:
        tx_code = type_match.group(1)
        ref = type_match.group(2).strip()

    return {
        "tx_date": tx_date,
        "value_date": value_date,
        "amount": amount,
        "direction": direction,
        "reference": ref,
        "tx_code": tx_code,
        "description": "",
    }


def _build_tx(data: dict) -> ParsedTransaction:
    return ParsedTransaction(
        tx_date=data["tx_date"],
        value_date=data.get("value_date"),
        amount=data["amount"],
        direction=data["direction"],
        description=data.get("description", ""),
        reference=data.get("reference", ""),
        counterparty="",
        tx_code=data.get("tx_code", ""),
    )


def _parse_date(s: str) -> date:
    """Parse YYMMDD date string."""
    if len(s) == 6:
        yy, mm, dd = int(s[:2]), int(s[2:4]), int(s[4:6])
        year = 2000 + yy
        return date(year, mm, dd)
    return date.today()


def _parse_amount(s: str) -> Decimal:
    """Parse MT940 amount: uses comma as decimal separator."""
    s = s.strip().replace(",", ".")
    try:
        return Decimal(s)
    except Exception:
        return Decimal("0")
