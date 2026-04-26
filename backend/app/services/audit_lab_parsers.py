"""
backend/app/services/audit_lab_parsers.py

Shared parsing module for Audit Lab file ingestion.

Supports:
  - CSV   (confidence 1.0)
  - XLSX  (confidence 0.8-1.0)
  - PDF   (confidence 0.5-0.9)
  - SWIFT MT300/MT320  (confidence 0.95)

Every parser returns the same tuple:
    tuple[list[dict], list[str], set[str]]
    =  (rows, warnings, currency_pairs_detected)

Row dicts always include:
    row_index, trade_date, value_date, currency_sold, currency_bought,
    amount_sold, amount_bought, effective_rate, counterparty, fee_amount,
    fee_currency, reference, parse_warnings
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from datetime import date, datetime
from typing import Any

# ---------------------------------------------------------------------------
# Optional heavy imports — graceful degradation when not installed
# ---------------------------------------------------------------------------
try:
    import openpyxl  # type: ignore[import-untyped]

    _HAS_OPENPYXL = True
except ImportError:
    openpyxl = None  # type: ignore[assignment]
    _HAS_OPENPYXL = False

try:
    import pdfplumber  # type: ignore[import-untyped]

    _HAS_PDFPLUMBER = True
except ImportError:
    pdfplumber = None  # type: ignore[assignment]
    _HAS_PDFPLUMBER = False

# ---------------------------------------------------------------------------
# Field alias mapping  (canonical -> accepted raw names)
# ---------------------------------------------------------------------------
FIELD_ALIASES: dict[str, list[str]] = {
    "trade_date":      ["trade_date", "tradedate", "date", "value_date", "trade date"],
    "value_date":      ["value_date", "valuedate", "settlement_date"],
    "currency_sold":   ["currency_sold", "sold_ccy", "sell_ccy", "from_currency", "ccy_sold"],
    "currency_bought": ["currency_bought", "bought_ccy", "buy_ccy", "to_currency", "ccy_bought"],
    "amount_sold":     ["amount_sold", "sell_amount", "from_amount", "notional_sold", "amount sold"],
    "amount_bought":   ["amount_bought", "buy_amount", "to_amount", "notional_bought", "amount bought"],
    "counterparty":    ["counterparty", "bank", "cp", "dealer", "counter_party"],
    "fee_amount":      ["fee_amount", "fee", "fees", "commission", "service_charge"],
    "fee_currency":    ["fee_currency", "fee_ccy", "commission_currency"],
    "reference":       ["reference", "ref", "transaction_id", "txn_id", "deal_ref"],
}

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def normalize_headers(headers: list[str]) -> dict[str, str]:
    """Map raw headers to canonical field names.

    Returns dict of ``{canonical_name: raw_header_string}``.
    """
    raw_lower = {h.strip().lower(): h for h in headers}
    mapping: dict[str, str] = {}
    for canonical, aliases in FIELD_ALIASES.items():
        for alias in aliases:
            if alias in raw_lower:
                mapping[canonical] = raw_lower[alias]
                break
    return mapping


def parse_date(s: str | None) -> date | None:
    """Multi-format date parser supporting ISO, European, and US date formats."""
    if not s:
        return None
    s = s.strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def parse_float(s: str | None) -> float | None:
    """Comma-aware float parser (strips commas then converts)."""
    if s is None:
        return None
    s = s.strip().replace(",", "")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def row_canonical(row_data: dict) -> str:
    """Deterministic JSON string for a row (sorted keys, str default)."""
    return json.dumps(row_data, sort_keys=True, default=str)


def row_hash(row_data: dict) -> str:
    """SHA-256 hex digest of the canonical JSON representation."""
    return hashlib.sha256(row_canonical(row_data).encode("utf-8")).hexdigest()


def row_confidence(row_data: dict) -> float:
    """Return minimum field-level confidence for a parsed row.

    Looks inside ``parse_warnings`` for entries shaped
    ``{"field": ..., "confidence": float}``.  If none are present the row
    is assumed to be fully confident (1.0).
    """
    warnings = row_data.get("parse_warnings", [])
    confidences: list[float] = []
    for w in warnings:
        if isinstance(w, dict) and "confidence" in w:
            confidences.append(float(w["confidence"]))
    return min(confidences) if confidences else 1.0


# ---------------------------------------------------------------------------
# Internal: build a row dict from canonical field values
# ---------------------------------------------------------------------------

def _build_row(
    *,
    row_index: int,
    trade_date: str | None,
    value_date: str | None,
    currency_sold: str | None,
    currency_bought: str | None,
    amount_sold: float | None,
    amount_bought: float | None,
    counterparty: str | None,
    fee_amount: float | None,
    fee_currency: str | None,
    reference: str | None,
    parse_warnings: list[Any],
) -> dict:
    effective_rate: float | None = None
    if amount_sold and amount_bought and amount_sold != 0:
        effective_rate = amount_bought / amount_sold

    row_warnings: list[Any] = list(parse_warnings)
    if not trade_date:
        row_warnings.append(f"Row {row_index}: missing trade_date")
    if not currency_sold or not currency_bought:
        row_warnings.append(f"Row {row_index}: missing currency_sold or currency_bought")

    return {
        "row_index": row_index,
        "trade_date": trade_date,
        "value_date": value_date,
        "currency_sold": currency_sold,
        "currency_bought": currency_bought,
        "amount_sold": amount_sold,
        "amount_bought": amount_bought,
        "effective_rate": effective_rate,
        "counterparty": counterparty,
        "fee_amount": fee_amount,
        "fee_currency": fee_currency,
        "reference": reference,
        "parse_warnings": row_warnings,
    }


# ---------------------------------------------------------------------------
# File-type detection
# ---------------------------------------------------------------------------

# Magic byte signatures
_XLSX_MAGIC = b"PK"                     # ZIP archive (OOXML)
_PDF_MAGIC = b"%PDF"
_SWIFT_HEADER_RE = re.compile(r"^\{1:", re.MULTILINE)


def detect_file_type(filename: str, raw_bytes: bytes) -> str:
    """Detect upload format.

    Returns one of ``"csv"``, ``"xlsx"``, ``"pdf"``, ``"swift"``, or
    ``"unknown"``.

    Uses extension first, then falls back to magic-byte / content
    inspection.
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    # Extension-based (fast path)
    if ext in ("csv", "tsv"):
        return "csv"
    if ext in ("xlsx", "xls"):
        return "xlsx"
    if ext == "pdf":
        return "pdf"
    if ext in ("mt300", "mt320", "mt", "fin", "swift", "swi"):
        return "swift"

    # Magic-byte fallback
    header = raw_bytes[:8]
    if header.startswith(_PDF_MAGIC):
        return "pdf"
    if header.startswith(_XLSX_MAGIC):
        return "xlsx"

    # SWIFT text heuristic: look for "{1:" or tag lines like ":20:"
    try:
        text_sample = raw_bytes[:2048].decode("utf-8", errors="replace")
        if _SWIFT_HEADER_RE.search(text_sample) or re.search(r"^:20:", text_sample, re.MULTILINE):
            return "swift"
    except Exception:
        pass

    # Try to decode as CSV (last resort)
    try:
        text_sample = raw_bytes[:2048].decode("utf-8-sig", errors="strict")
        if "," in text_sample or "\t" in text_sample:
            return "csv"
    except Exception:
        pass

    return "unknown"


# ═══════════════════════════════════════════════════════════════════════════════
# CSV Parser
# ═══════════════════════════════════════════════════════════════════════════════

def parse_csv(
    raw_bytes: bytes,
) -> tuple[list[dict], list[str], set[str]]:
    """Parse CSV bytes into audit-lab row dicts.

    Returns ``(rows, warnings, currency_pairs_detected)``.
    Raises ``ValueError`` when headers are missing.
    """
    text_content = raw_bytes.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text_content))
    if reader.fieldnames is None:
        raise ValueError("CSV has no headers.")

    header_map = normalize_headers(list(reader.fieldnames))
    rows: list[dict] = []
    warnings: list[str] = []
    currency_pairs: set[str] = set()

    for i, raw_row in enumerate(reader):
        def _get(field: str, _row: dict = raw_row) -> str | None:  # noqa: B008
            h = header_map.get(field)
            return _row.get(h, "").strip() if h else None

        trade_date_str = _get("trade_date")
        currency_sold = _get("currency_sold")
        currency_bought = _get("currency_bought")

        row_data = _build_row(
            row_index=i,
            trade_date=trade_date_str,
            value_date=_get("value_date"),
            currency_sold=currency_sold,
            currency_bought=currency_bought,
            amount_sold=parse_float(_get("amount_sold")),
            amount_bought=parse_float(_get("amount_bought")),
            counterparty=_get("counterparty"),
            fee_amount=parse_float(_get("fee_amount")),
            fee_currency=_get("fee_currency"),
            reference=_get("reference"),
            parse_warnings=[],
        )
        rows.append(row_data)
        warnings.extend(
            w for w in row_data["parse_warnings"] if isinstance(w, str)
        )
        if currency_sold and currency_bought:
            currency_pairs.add(f"{currency_sold.upper()}{currency_bought.upper()}")

    return rows, warnings, currency_pairs


# ═══════════════════════════════════════════════════════════════════════════════
# XLSX Parser  (Item 21)
# ═══════════════════════════════════════════════════════════════════════════════

def parse_xlsx(
    raw_bytes: bytes,
) -> tuple[list[dict], list[str], set[str]]:
    """Parse XLSX bytes into audit-lab row dicts.

    Auto-detects the header row as the first row with >= 3 non-empty cells.
    Applies the same alias mapping as CSV.

    Requires ``openpyxl``.  Raises ``ImportError`` if unavailable.
    Returns ``(rows, warnings, currency_pairs_detected)``.
    """
    if not _HAS_OPENPYXL:
        raise ImportError(
            "openpyxl is required for XLSX parsing. "
            "Install it with: pip install openpyxl"
        )

    wb = openpyxl.load_workbook(io.BytesIO(raw_bytes), read_only=True, data_only=True)
    ws = wb.active
    if ws is None:
        raise ValueError("XLSX workbook contains no active sheet.")

    all_rows_raw: list[list[Any]] = []
    for row in ws.iter_rows(values_only=True):
        all_rows_raw.append(list(row))
    wb.close()

    if not all_rows_raw:
        raise ValueError("XLSX sheet is empty.")

    # Auto-detect header row: first row with >= 3 non-empty cells
    header_row_idx: int | None = None
    for idx, row_cells in enumerate(all_rows_raw):
        non_empty = sum(1 for c in row_cells if c is not None and str(c).strip())
        if non_empty >= 3:
            header_row_idx = idx
            break

    if header_row_idx is None:
        raise ValueError(
            "Could not detect a header row in the XLSX file "
            "(no row with 3+ non-empty cells found)."
        )

    raw_headers = [str(c).strip() if c else "" for c in all_rows_raw[header_row_idx]]
    header_map = normalize_headers(raw_headers)

    rows: list[dict] = []
    warnings: list[str] = []
    currency_pairs: set[str] = set()

    data_rows = all_rows_raw[header_row_idx + 1 :]

    for i, row_cells in enumerate(data_rows):
        # Skip fully blank rows
        if all(c is None or str(c).strip() == "" for c in row_cells):
            continue

        # Build a {raw_header: cell_value} dict for this row
        cell_map: dict[str, str] = {}
        for col_idx, cell_val in enumerate(row_cells):
            if col_idx < len(raw_headers):
                cell_map[raw_headers[col_idx]] = str(cell_val).strip() if cell_val is not None else ""

        def _get(field: str, _cm: dict[str, str] = cell_map) -> str | None:
            h = header_map.get(field)
            if h is None:
                return None
            val = _cm.get(h, "").strip()
            return val if val else None

        trade_date_str = _get("trade_date")
        currency_sold = _get("currency_sold")
        currency_bought = _get("currency_bought")

        # Confidence: 1.0 if cell was present, 0.8 if we had to coerce from
        # a date object or numeric cell
        field_confidences: list[float] = []
        for fld in ("trade_date", "currency_sold", "currency_bought", "amount_sold", "amount_bought"):
            val = _get(fld)
            if val is not None:
                field_confidences.append(1.0)
            else:
                # mapped header exists but cell was empty
                if header_map.get(fld) is not None:
                    field_confidences.append(0.8)

        confidence = min(field_confidences) if field_confidences else 0.8

        row_warnings: list[Any] = []
        if confidence < 1.0:
            row_warnings.append({"source": "xlsx", "confidence": confidence})

        row_data = _build_row(
            row_index=i,
            trade_date=trade_date_str,
            value_date=_get("value_date"),
            currency_sold=currency_sold,
            currency_bought=currency_bought,
            amount_sold=parse_float(_get("amount_sold")),
            amount_bought=parse_float(_get("amount_bought")),
            counterparty=_get("counterparty"),
            fee_amount=parse_float(_get("fee_amount")),
            fee_currency=_get("fee_currency"),
            reference=_get("reference"),
            parse_warnings=row_warnings,
        )
        rows.append(row_data)
        warnings.extend(
            w for w in row_data["parse_warnings"] if isinstance(w, str)
        )
        if currency_sold and currency_bought:
            currency_pairs.add(f"{currency_sold.upper()}{currency_bought.upper()}")

    return rows, warnings, currency_pairs


# ═══════════════════════════════════════════════════════════════════════════════
# PDF Parser  (Item 22)
# ═══════════════════════════════════════════════════════════════════════════════

def parse_pdf(
    raw_bytes: bytes,
) -> tuple[list[dict], list[str], set[str]]:
    """Parse PDF bytes by extracting tabular data via ``pdfplumber``.

    Field confidence ranges from 0.5 (poor extraction) to 0.9 (clean table).
    Requires ``pdfplumber``.  Raises ``ImportError`` if unavailable.
    Returns ``(rows, warnings, currency_pairs_detected)``.
    """
    if not _HAS_PDFPLUMBER:
        raise ImportError(
            "pdfplumber is required for PDF parsing. "
            "Install it with: pip install pdfplumber"
        )

    pdf = pdfplumber.open(io.BytesIO(raw_bytes))

    # Collect all tables from all pages
    merged_tables: list[list[list[str | None]]] = []
    for page in pdf.pages:
        tables = page.extract_tables()
        if tables:
            merged_tables.extend(tables)
    pdf.close()

    if not merged_tables:
        raise ValueError("No tables detected in the PDF.")

    # Merge all tables, using the first table's first row as headers
    all_data_rows: list[list[str | None]] = []
    raw_headers: list[str] = []

    for tbl_idx, table in enumerate(merged_tables):
        if not table:
            continue
        if tbl_idx == 0:
            # First table: row 0 is headers
            raw_headers = [str(c).strip() if c else "" for c in table[0]]
            all_data_rows.extend(table[1:])
        else:
            # Subsequent tables: check if first row matches headers
            candidate_headers = [str(c).strip() if c else "" for c in table[0]]
            if candidate_headers == raw_headers:
                all_data_rows.extend(table[1:])
            else:
                all_data_rows.extend(table)

    if not raw_headers:
        raise ValueError("PDF tables have no detectable headers.")

    header_map = normalize_headers(raw_headers)

    rows: list[dict] = []
    warnings: list[str] = []
    currency_pairs: set[str] = set()

    for i, row_cells in enumerate(all_data_rows):
        # Skip blank rows
        if all(c is None or str(c).strip() == "" for c in row_cells):
            continue

        cell_map: dict[str, str] = {}
        for col_idx, cell_val in enumerate(row_cells):
            if col_idx < len(raw_headers):
                cell_map[raw_headers[col_idx]] = str(cell_val).strip() if cell_val is not None else ""

        def _get(field: str, _cm: dict[str, str] = cell_map) -> str | None:
            h = header_map.get(field)
            if h is None:
                return None
            val = _cm.get(h, "").strip()
            return val if val else None

        trade_date_str = _get("trade_date")
        currency_sold = _get("currency_sold")
        currency_bought = _get("currency_bought")

        # PDF field confidence assessment
        # Start at 0.9 (structured table), degrade for quality issues
        field_confidences: list[float] = []
        for fld in ("trade_date", "currency_sold", "currency_bought", "amount_sold", "amount_bought"):
            val = _get(fld)
            if val is not None and val.strip():
                # Check for OCR-like artifacts (mixed alpha-numeric in amounts)
                if fld in ("amount_sold", "amount_bought"):
                    cleaned = val.replace(",", "").replace(".", "").replace("-", "")
                    if cleaned and not cleaned.replace(" ", "").isdigit():
                        field_confidences.append(0.5)
                    else:
                        field_confidences.append(0.9)
                elif fld in ("currency_sold", "currency_bought"):
                    if len(val) == 3 and val.isalpha():
                        field_confidences.append(0.9)
                    else:
                        field_confidences.append(0.6)
                else:
                    # trade_date
                    if parse_date(val) is not None:
                        field_confidences.append(0.9)
                    else:
                        field_confidences.append(0.6)
            else:
                # Missing field from PDF extraction
                if header_map.get(fld) is not None:
                    field_confidences.append(0.5)

        confidence = min(field_confidences) if field_confidences else 0.5

        row_warnings: list[Any] = [
            {"source": "pdf", "confidence": confidence}
        ]

        row_data = _build_row(
            row_index=i,
            trade_date=trade_date_str,
            value_date=_get("value_date"),
            currency_sold=currency_sold,
            currency_bought=currency_bought,
            amount_sold=parse_float(_get("amount_sold")),
            amount_bought=parse_float(_get("amount_bought")),
            counterparty=_get("counterparty"),
            fee_amount=parse_float(_get("fee_amount")),
            fee_currency=_get("fee_currency"),
            reference=_get("reference"),
            parse_warnings=row_warnings,
        )
        rows.append(row_data)
        warnings.extend(
            w for w in row_data["parse_warnings"] if isinstance(w, str)
        )
        if currency_sold and currency_bought:
            currency_pairs.add(f"{currency_sold.upper()}{currency_bought.upper()}")

    return rows, warnings, currency_pairs


# ═══════════════════════════════════════════════════════════════════════════════
# SWIFT MT300/MT320 Parser  (Item 25)
# ═══════════════════════════════════════════════════════════════════════════════

# SWIFT FIN tag-value regex:  :{tag}:{value}
_TAG_LINE_RE = re.compile(r"^:(\d{2}[A-Z]?):(.+)$", re.MULTILINE)

# Message-block boundary: "{4:" starts the text block
_MSG_BOUNDARY_RE = re.compile(r"\{4:")


def _parse_swift_amount(raw: str) -> tuple[str | None, float | None]:
    """Parse a SWIFT amount field like ``USD1000000,50`` or ``EUR500000``.

    Returns ``(currency, amount)`` or ``(None, None)``.
    """
    raw = raw.strip()
    # Pattern: 3-letter currency code followed by numeric amount
    m = re.match(r"([A-Z]{3})([\d,\.]+)", raw)
    if not m:
        return None, None
    ccy = m.group(1)
    amt_str = m.group(2).replace(",", ".")
    try:
        amt = float(amt_str)
    except ValueError:
        return ccy, None
    return ccy, amt


def _split_swift_messages(raw_text: str) -> list[str]:
    """Split a multi-message SWIFT file into individual message strings.

    If no block boundaries are found the entire text is treated as one message.
    """
    parts = _MSG_BOUNDARY_RE.split(raw_text)
    messages = []
    for p in parts:
        stripped = p.strip()
        if stripped and _TAG_LINE_RE.search(stripped):
            messages.append(stripped)
    if not messages:
        messages = [raw_text]
    return messages


def _extract_swift_tags(message_text: str) -> dict[str, str]:
    """Extract all SWIFT FIN tags from a message block.

    Returns ``{tag: value}`` where tag is e.g. ``"30T"``, ``"32B"``.
    For duplicate tags the last occurrence wins.
    """
    tags: dict[str, str] = {}
    for match in _TAG_LINE_RE.finditer(message_text):
        tags[match.group(1)] = match.group(2).strip()
    return tags


def parse_swift_mt(
    raw_text: str,
) -> tuple[list[dict], list[str], set[str]]:
    """Parse SWIFT FIN MT300/MT320 messages.

    Supported tags:
      - 30T : trade date
      - 30V : value date
      - 36  : exchange rate
      - 32B : amount sold (currency + amount)
      - 33B : amount bought (currency + amount)
      - 82A / 87A : counterparty
      - 20  : deal reference

    Confidence: 0.95 (structured format).
    Returns ``(rows, warnings, currency_pairs_detected)``.
    """
    messages = _split_swift_messages(raw_text)

    rows: list[dict] = []
    warnings: list[str] = []
    currency_pairs: set[str] = set()

    for i, msg in enumerate(messages):
        tags = _extract_swift_tags(msg)
        if not tags:
            warnings.append(f"Message {i}: no SWIFT tags found")
            continue

        # Trade date  (tag 30T)
        trade_date_raw = tags.get("30T")
        trade_date_str: str | None = None
        if trade_date_raw:
            # SWIFT dates are YYYYMMDD
            try:
                dt = datetime.strptime(trade_date_raw.strip(), "%Y%m%d")
                trade_date_str = dt.strftime("%Y-%m-%d")
            except ValueError:
                trade_date_str = trade_date_raw.strip()

        # Value date  (tag 30V)
        value_date_raw = tags.get("30V")
        value_date_str: str | None = None
        if value_date_raw:
            try:
                dt = datetime.strptime(value_date_raw.strip(), "%Y%m%d")
                value_date_str = dt.strftime("%Y-%m-%d")
            except ValueError:
                value_date_str = value_date_raw.strip()

        # Amounts  (32B = sold, 33B = bought)
        ccy_sold, amt_sold = _parse_swift_amount(tags.get("32B", ""))
        ccy_bought, amt_bought = _parse_swift_amount(tags.get("33B", ""))

        # Exchange rate  (tag 36)
        rate_raw = tags.get("36")
        effective_rate: float | None = None
        if rate_raw:
            try:
                effective_rate = float(rate_raw.strip().replace(",", "."))
            except ValueError:
                pass

        # Counterparty  (82A or 87A)
        counterparty = tags.get("82A") or tags.get("87A")

        # Reference  (tag 20)
        reference = tags.get("20")

        # Fee  (tag 34B in some variants)
        fee_ccy, fee_amt = _parse_swift_amount(tags.get("34B", ""))

        row_warnings: list[Any] = [
            {"source": "swift", "confidence": 0.95}
        ]

        row_data = _build_row(
            row_index=i,
            trade_date=trade_date_str,
            value_date=value_date_str,
            currency_sold=ccy_sold,
            currency_bought=ccy_bought,
            amount_sold=amt_sold,
            amount_bought=amt_bought,
            counterparty=counterparty,
            fee_amount=fee_amt,
            fee_currency=fee_ccy,
            reference=reference,
            parse_warnings=row_warnings,
        )

        # Override effective_rate if explicitly provided by tag 36
        if effective_rate is not None:
            row_data["effective_rate"] = effective_rate

        rows.append(row_data)
        warnings.extend(
            w for w in row_data["parse_warnings"] if isinstance(w, str)
        )
        if ccy_sold and ccy_bought:
            currency_pairs.add(f"{ccy_sold.upper()}{ccy_bought.upper()}")

    return rows, warnings, currency_pairs
