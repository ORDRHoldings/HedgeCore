"""
Pure-function BAI2 bank statement parser.

Deterministic. No DB access. No side effects.

BAI2 record types:
  01 = File header, 02 = Group header, 03 = Account header,
  16 = Transaction detail, 49 = Account trailer, 88 = Continuation,
  98 = Group trailer, 99 = File trailer.

BAI2 amounts are in cents (integer). Divide by 100 for actual amount.
Transaction type codes: 100-399 = credits, 400-699 = debits.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.services.parsers.statement_types import ParsedStatement, ParsedTransaction


def parse_bai2(content: str) -> list[ParsedStatement]:
    """Parse BAI2 content into a list of ParsedStatement objects."""
    content = content.strip()
    if not content:
        return []

    # Pre-process: join continuation records (88) to previous lines
    lines = _join_continuations(content.split("\n"))

    statements: list[ParsedStatement] = []
    currency = "USD"
    current_account = ""
    current_opening = Decimal("0")
    transactions: list[ParsedTransaction] = []
    group_date = date.today()

    for line in lines:
        line = line.strip().rstrip("/")
        if not line:
            continue

        fields = line.split(",")
        record_type = fields[0] if fields else ""

        if record_type == "02":
            # Group header — extract date and currency
            if len(fields) >= 7:
                date_str = fields[4] if len(fields) > 4 else ""
                if date_str and len(date_str) == 6:
                    group_date = _parse_date(date_str)
                currency = fields[6] if len(fields) > 6 and fields[6] else "USD"

        elif record_type == "03":
            # Account header — flush previous if exists
            if current_account and transactions:
                statements.append(ParsedStatement(
                    account_identifier=current_account,
                    statement_date=group_date,
                    opening_balance=current_opening,
                    closing_balance=current_opening,  # updated from trailer
                    currency=currency,
                    transactions=list(transactions),
                ))

            current_account = fields[1] if len(fields) > 1 else ""
            transactions = []
            current_opening = Decimal("0")

            # Parse summary balances from field 3 onwards (type_code, amount pairs)
            i = 2
            while i + 1 < len(fields):
                bal_type = fields[i].strip()
                bal_amt = fields[i + 1].strip()
                if bal_type in ("010", "015") and bal_amt:
                    try:
                        current_opening = Decimal(bal_amt) / 100
                    except Exception:
                        pass
                    break
                i += 2

        elif record_type == "16":
            # Transaction detail
            tx = _parse_tx(fields, group_date)
            if tx:
                transactions.append(tx)

        elif record_type == "49":
            # Account trailer — flush current account
            closing = current_opening
            if len(fields) > 1 and fields[1].strip():
                try:
                    closing = Decimal(fields[1].strip()) / 100
                except Exception:
                    pass

            if current_account:
                statements.append(ParsedStatement(
                    account_identifier=current_account,
                    statement_date=group_date,
                    opening_balance=current_opening,
                    closing_balance=closing,
                    currency=currency,
                    transactions=list(transactions),
                ))
            current_account = ""
            transactions = []

    return statements


def _join_continuations(lines: list[str]) -> list[str]:
    """Concatenate 88-continuation records to the previous record."""
    result: list[str] = []
    for line in lines:
        stripped = line.strip().rstrip("/")
        if stripped.startswith("88,"):
            if result:
                # Append continuation text (after "88,") to previous line
                result[-1] = result[-1].rstrip("/") + stripped[3:]
            continue
        result.append(line)
    return result


def _parse_tx(fields: list[str], default_date: date) -> ParsedTransaction | None:
    """Parse a type-16 transaction record.

    Fields: 16, type_code, amount, fund_type, date, time, ref, description
    """
    if len(fields) < 3:
        return None

    type_code = fields[1].strip() if len(fields) > 1 else ""
    amount_str = fields[2].strip() if len(fields) > 2 else "0"

    try:
        amount = Decimal(amount_str) / 100  # BAI2 amounts in cents
    except Exception:
        amount = Decimal("0")

    # Direction from type code: 100-399 = credit, 400-699 = debit
    direction = "CREDIT"
    try:
        code_int = int(type_code)
        if 400 <= code_int <= 699:
            direction = "DEBIT"
    except ValueError:
        pass

    # Date (field 4)
    tx_date = default_date
    if len(fields) > 4 and fields[4].strip():
        date_str = fields[4].strip()
        if len(date_str) == 6:
            tx_date = _parse_date(date_str)

    # Reference (field 6) and description (field 7+)
    reference = fields[6].strip() if len(fields) > 6 else ""
    description = ",".join(fields[7:]).strip() if len(fields) > 7 else ""

    return ParsedTransaction(
        tx_date=tx_date,
        value_date=None,
        amount=amount,
        direction=direction,
        description=description,
        reference=reference,
        counterparty="",
        tx_code=type_code,
    )


def _parse_date(s: str) -> date:
    """Parse YYMMDD date string."""
    try:
        yy, mm, dd = int(s[:2]), int(s[2:4]), int(s[4:6])
        return date(2000 + yy, mm, dd)
    except (ValueError, IndexError):
        return date.today()
