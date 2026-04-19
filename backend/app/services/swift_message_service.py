"""
SWIFT / ISO 20022 payment message generators.

Pure, deterministic formatters that render an approved PaymentInstruction into
either MT103 (SWIFT FIN, legacy) or pain.001.001.09 (ISO 20022, modern CBPR+)
wire-format messages. No I/O, no side effects — enables straight-through
processing from hedge approval -> bank connectivity layer.

Supported payment_type -> message-format mapping:
    SWIFT, CHAPS  -> MT103 preferred, pain.001 available
    SEPA          -> pain.001 preferred, MT103 unavailable
    ACH, FPS      -> pain.001 preferred, MT103 unavailable
"""
from __future__ import annotations

import hashlib
import html
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any, Literal

MessageFormat = Literal["mt103", "pain001"]

# payment_type -> formats that are valid for that rail
_SUPPORTED_FORMATS: dict[str, set[MessageFormat]] = {
    "SWIFT": {"mt103", "pain001"},
    "CHAPS": {"mt103", "pain001"},
    "SEPA": {"pain001"},
    "ACH": {"pain001"},
    "FPS": {"pain001"},
}


class SwiftMessageError(ValueError):
    """Raised when a payment cannot be rendered in the requested format."""


@dataclass(frozen=True)
class OrderingParty:
    """Debtor / ordering-customer identity. Callers supply from Company record."""
    name: str
    address_line1: str = ""
    address_line2: str = ""
    country_code: str = ""
    account_number: str = ""
    bic: str = ""


@dataclass(frozen=True)
class GeneratedMessage:
    format: MessageFormat
    content: str
    message_hash: str  # SHA-256 hex of content bytes
    message_reference: str  # UETR-like; first 16 chars of content hash


def _amount_swift(value: Decimal | float | str) -> str:
    """SWIFT amount: comma decimal separator, no thousands separator, max 15 digits.

    Examples: Decimal("1234567.89") -> "1234567,89"; Decimal("100") -> "100,".
    """
    d = value if isinstance(value, Decimal) else Decimal(str(value))
    # Normalise to 2dp for non-JPY-like currencies; callers override if needed
    quantized = d.quantize(Decimal("0.01"))
    return format(quantized, "f").replace(".", ",")


def _short_date(d: date) -> str:
    return d.strftime("%y%m%d")


def _iso_date(d: date | datetime) -> str:
    if isinstance(d, datetime):
        return d.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S")
    return d.strftime("%Y-%m-%d")


def _hash_and_ref(content: str) -> tuple[str, str]:
    h = hashlib.sha256(content.encode("utf-8")).hexdigest()
    return h, h[:16].upper()


def _validate_format(payment_type: str, fmt: MessageFormat) -> None:
    allowed = _SUPPORTED_FORMATS.get(payment_type.upper())
    if not allowed:
        raise SwiftMessageError(f"Unsupported payment_type: {payment_type}")
    if fmt not in allowed:
        raise SwiftMessageError(
            f"Format {fmt} not supported for payment_type {payment_type}; "
            f"allowed: {sorted(allowed)}"
        )


def _require(payment: dict[str, Any], field: str) -> Any:
    v = payment.get(field)
    if v is None or (isinstance(v, str) and not v.strip()):
        raise SwiftMessageError(f"Missing required payment field: {field}")
    return v


# ── MT103 ──────────────────────────────────────────────────────────────────

def generate_mt103(
    payment: dict[str, Any],
    beneficiary: dict[str, Any],
    ordering: OrderingParty,
    *,
    charges_code: Literal["SHA", "OUR", "BEN"] = "SHA",
) -> GeneratedMessage:
    """Render MT103 single customer credit transfer.

    Required payment keys: amount, currency, execution_date, reference, instruction_hash.
    Required beneficiary keys: name, account_number, bank_code (BIC), bank_name.
    """
    _validate_format(str(_require(payment, "payment_type")), "mt103")

    amount = _amount_swift(_require(payment, "amount"))
    currency = str(_require(payment, "currency")).upper()
    exec_date = _require(payment, "execution_date")
    if isinstance(exec_date, str):
        exec_date = date.fromisoformat(exec_date)
    reference = str(_require(payment, "reference"))[:16] or "REF"
    remittance = str(payment.get("memo") or reference)[:140]

    bene_name = str(_require(beneficiary, "name"))[:35]
    bene_account = str(_require(beneficiary, "account_number"))[:34]
    bene_bic = str(_require(beneficiary, "bank_code"))[:11]
    ordering_name = ordering.name[:35] if ordering.name else "ORDERING CUSTOMER"

    # SWIFT FIN-like block (stripped to Block 4 content, human-readable)
    lines: list[str] = [
        "{1:F01" + ordering.bic.ljust(12, "X")[:12] + "0000000000}",
        "{2:I103" + bene_bic.ljust(12, "X")[:12] + "N}",
        "{4:",
        f":20:{reference}",
        ":23B:CRED",
        f":32A:{_short_date(exec_date)}{currency}{amount}",
        f":50K:/{ordering.account_number or ordering.bic or 'ACCOUNT'}",
        ordering_name,
    ]
    if ordering.address_line1:
        lines.append(ordering.address_line1[:35])
    if ordering.address_line2:
        lines.append(ordering.address_line2[:35])
    if ordering.country_code:
        lines.append(ordering.country_code.upper()[:2])

    lines.extend([
        f":57A:{bene_bic}",
        f":59:/{bene_account}",
        bene_name,
        f":70:{remittance[:35]}",
        f":71A:{charges_code}",
        "-}",
    ])

    content = "\n".join(lines) + "\n"
    message_hash, message_ref = _hash_and_ref(content)
    return GeneratedMessage(
        format="mt103", content=content,
        message_hash=message_hash, message_reference=message_ref,
    )


# ── pain.001.001.09 (ISO 20022 CBPR+) ─────────────────────────────────────

def generate_pain001(
    payment: dict[str, Any],
    beneficiary: dict[str, Any],
    ordering: OrderingParty,
) -> GeneratedMessage:
    """Render ISO 20022 pain.001.001.09 customer credit transfer initiation."""
    _validate_format(str(_require(payment, "payment_type")), "pain001")

    amount = _require(payment, "amount")
    amount_str = format(
        (amount if isinstance(amount, Decimal) else Decimal(str(amount))).quantize(Decimal("0.01")),
        "f",
    )
    currency = str(_require(payment, "currency")).upper()
    exec_date = _require(payment, "execution_date")
    if isinstance(exec_date, str):
        exec_date = date.fromisoformat(exec_date)
    reference = str(_require(payment, "reference"))
    payment_id = str(payment.get("id") or _require(payment, "instruction_hash"))[:35]
    msg_id = str(payment.get("instruction_hash") or uuid.uuid4().hex)[:35]
    remittance = str(payment.get("memo") or reference)

    bene_name = str(_require(beneficiary, "name"))
    bene_account = str(_require(beneficiary, "account_number"))
    bene_bic = str(_require(beneficiary, "bank_code"))

    def x(v: str) -> str:
        return html.escape(v, quote=True)

    now_iso = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S")

    dbtr_block = [
        f"        <Dbtr><Nm>{x(ordering.name or 'Ordering Customer')}</Nm>",
    ]
    if ordering.address_line1 or ordering.country_code:
        dbtr_block.append("          <PstlAdr>")
        if ordering.address_line1:
            dbtr_block.append(f"            <AdrLine>{x(ordering.address_line1)}</AdrLine>")
        if ordering.address_line2:
            dbtr_block.append(f"            <AdrLine>{x(ordering.address_line2)}</AdrLine>")
        if ordering.country_code:
            dbtr_block.append(f"            <Ctry>{x(ordering.country_code.upper())}</Ctry>")
        dbtr_block.append("          </PstlAdr>")
    dbtr_block.append("        </Dbtr>")

    dbtr_acct = (
        f"        <DbtrAcct><Id><Othr><Id>{x(ordering.account_number or 'NOTPROVIDED')}</Id></Othr></Id></DbtrAcct>"
    )
    dbtr_agt = (
        f"        <DbtrAgt><FinInstnId><BICFI>{x(ordering.bic or 'NOTPROVIDED')}</BICFI></FinInstnId></DbtrAgt>"
        if ordering.bic else
        "        <DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>"
    )

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09">\n'
        '  <CstmrCdtTrfInitn>\n'
        '    <GrpHdr>\n'
        f'      <MsgId>{x(msg_id)}</MsgId>\n'
        f'      <CreDtTm>{now_iso}</CreDtTm>\n'
        '      <NbOfTxs>1</NbOfTxs>\n'
        f'      <CtrlSum>{amount_str}</CtrlSum>\n'
        f'      <InitgPty><Nm>{x(ordering.name or "Ordering Customer")}</Nm></InitgPty>\n'
        '    </GrpHdr>\n'
        '    <PmtInf>\n'
        f'      <PmtInfId>{x(payment_id)}</PmtInfId>\n'
        '      <PmtMtd>TRF</PmtMtd>\n'
        '      <BtchBookg>false</BtchBookg>\n'
        '      <NbOfTxs>1</NbOfTxs>\n'
        f'      <CtrlSum>{amount_str}</CtrlSum>\n'
        '      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>\n'
        f'      <ReqdExctnDt><Dt>{exec_date.isoformat()}</Dt></ReqdExctnDt>\n'
        + "\n".join(dbtr_block) + "\n"
        f"{dbtr_acct}\n{dbtr_agt}\n"
        '      <ChrgBr>SHAR</ChrgBr>\n'
        '      <CdtTrfTxInf>\n'
        f'        <PmtId><EndToEndId>{x(reference[:35])}</EndToEndId></PmtId>\n'
        f'        <Amt><InstdAmt Ccy="{x(currency)}">{amount_str}</InstdAmt></Amt>\n'
        f'        <CdtrAgt><FinInstnId><BICFI>{x(bene_bic)}</BICFI></FinInstnId></CdtrAgt>\n'
        f'        <Cdtr><Nm>{x(bene_name)}</Nm></Cdtr>\n'
        f'        <CdtrAcct><Id><Othr><Id>{x(bene_account)}</Id></Othr></Id></CdtrAcct>\n'
        f'        <RmtInf><Ustrd>{x(remittance[:140])}</Ustrd></RmtInf>\n'
        '      </CdtTrfTxInf>\n'
        '    </PmtInf>\n'
        '  </CstmrCdtTrfInitn>\n'
        '</Document>\n'
    )

    message_hash, message_ref = _hash_and_ref(xml)
    return GeneratedMessage(
        format="pain001", content=xml,
        message_hash=message_hash, message_reference=message_ref,
    )


# ── Dispatcher ─────────────────────────────────────────────────────────────

def generate_message(
    payment: dict[str, Any],
    beneficiary: dict[str, Any],
    ordering: OrderingParty,
    *,
    fmt: MessageFormat,
) -> GeneratedMessage:
    if fmt == "mt103":
        return generate_mt103(payment, beneficiary, ordering)
    if fmt == "pain001":
        return generate_pain001(payment, beneficiary, ordering)
    raise SwiftMessageError(f"Unknown format: {fmt}")


def supported_formats_for(payment_type: str) -> list[MessageFormat]:
    return sorted(_SUPPORTED_FORMATS.get(payment_type.upper(), set()))
