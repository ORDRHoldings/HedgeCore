"""Unit tests for SWIFT / pain.001 message generators."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from app.services.swift_message_service import (
    OrderingParty, SwiftMessageError,
    generate_message, generate_mt103, generate_pain001,
    supported_formats_for,
)


def _payment(**overrides):
    base = {
        "id": "11111111-1111-1111-1111-111111111111",
        "payment_type": "SWIFT",
        "amount": Decimal("1234.56"),
        "currency": "USD",
        "execution_date": date(2026, 5, 1),
        "reference": "INVOICE-42",
        "memo": "Q1 hedge settlement",
        "instruction_hash": "abc123def456",
    }
    base.update(overrides)
    return base


def _beneficiary(**overrides):
    base = {
        "name": "Acme Holdings",
        "bank_name": "JPMorgan Chase",
        "bank_code": "CHASUS33",
        "account_number": "US12345678",
        "country_code": "US",
        "currency": "USD",
    }
    base.update(overrides)
    return base


def _ordering():
    return OrderingParty(
        name="ORDR TreasuryFX Demo",
        bic="DEMOUS33",
        account_number="US99999999",
        country_code="US",
    )


class TestMT103:
    def test_contains_required_tags(self):
        msg = generate_mt103(_payment(), _beneficiary(), _ordering())
        assert msg.format == "mt103"
        for tag in (":20:", ":23B:CRED", ":32A:", ":50K:", ":57A:", ":59:", ":70:", ":71A:"):
            assert tag in msg.content

    def test_amount_uses_comma_decimal(self):
        msg = generate_mt103(_payment(amount=Decimal("100000.50")), _beneficiary(), _ordering())
        assert ":32A:260501USD100000,50" in msg.content
        assert "100000.50" not in msg.content

    def test_deterministic_hash(self):
        a = generate_mt103(_payment(), _beneficiary(), _ordering())
        b = generate_mt103(_payment(), _beneficiary(), _ordering())
        assert a.content == b.content
        assert a.message_hash == b.message_hash
        assert len(a.message_hash) == 64
        assert len(a.message_reference) == 16

    def test_rejects_sepa(self):
        with pytest.raises(SwiftMessageError, match="not supported"):
            generate_mt103(_payment(payment_type="SEPA"), _beneficiary(), _ordering())

    def test_rejects_ach(self):
        with pytest.raises(SwiftMessageError):
            generate_mt103(_payment(payment_type="ACH"), _beneficiary(), _ordering())

    def test_missing_amount(self):
        with pytest.raises(SwiftMessageError, match="Missing required"):
            generate_mt103(_payment(amount=None), _beneficiary(), _ordering())

    def test_charges_code_override(self):
        msg = generate_mt103(_payment(), _beneficiary(), _ordering(), charges_code="OUR")
        assert ":71A:OUR" in msg.content


class TestPain001:
    def test_valid_xml_structure(self):
        msg = generate_pain001(_payment(payment_type="SEPA", currency="EUR"), _beneficiary(), _ordering())
        assert msg.format == "pain001"
        assert msg.content.startswith('<?xml version="1.0" encoding="UTF-8"?>')
        assert "urn:iso:std:iso:20022:tech:xsd:pain.001.001.09" in msg.content
        assert "<CstmrCdtTrfInitn>" in msg.content
        assert "</CstmrCdtTrfInitn>" in msg.content
        assert "<PmtMtd>TRF</PmtMtd>" in msg.content

    def test_amount_formatting(self):
        msg = generate_pain001(
            _payment(payment_type="SEPA", currency="EUR", amount=Decimal("100000.50")),
            _beneficiary(currency="EUR"), _ordering(),
        )
        assert '<InstdAmt Ccy="EUR">100000.50</InstdAmt>' in msg.content
        assert "<CtrlSum>100000.50</CtrlSum>" in msg.content

    def test_xml_escaping_on_beneficiary_name(self):
        msg = generate_pain001(
            _payment(payment_type="SEPA"),
            _beneficiary(name="Smith & Co <Ltd>"), _ordering(),
        )
        assert "Smith &amp; Co &lt;Ltd&gt;" in msg.content
        assert "<Ltd>" not in msg.content.replace("&lt;Ltd&gt;", "")

    def test_unknown_payment_type_rejected(self):
        with pytest.raises(SwiftMessageError, match="Unsupported payment_type"):
            generate_pain001(_payment(payment_type="BOGUS"), _beneficiary(), _ordering())

    def test_ach_pain001_only_path(self):
        msg = generate_pain001(_payment(payment_type="ACH"), _beneficiary(), _ordering())
        assert msg.format == "pain001"

    def test_deterministic(self):
        a = generate_pain001(_payment(payment_type="SEPA"), _beneficiary(), _ordering())
        b = generate_pain001(_payment(payment_type="SEPA"), _beneficiary(), _ordering())
        # CreDtTm uses datetime.now so content will differ slightly; hash captures this.
        # Compare structural fields instead.
        for marker in ("<MsgId>abc123def456</MsgId>", "<EndToEndId>INVOICE-42</EndToEndId>"):
            assert marker in a.content and marker in b.content


class TestDispatcher:
    def test_generate_message_mt103(self):
        msg = generate_message(_payment(), _beneficiary(), _ordering(), fmt="mt103")
        assert msg.format == "mt103"

    def test_generate_message_pain001(self):
        msg = generate_message(
            _payment(payment_type="SEPA", currency="EUR"),
            _beneficiary(currency="EUR"), _ordering(), fmt="pain001",
        )
        assert msg.format == "pain001"

    def test_generate_message_invalid_format(self):
        with pytest.raises(SwiftMessageError, match="Unknown format"):
            generate_message(_payment(), _beneficiary(), _ordering(), fmt="bogus")  # type: ignore[arg-type]


class TestSupportedFormats:
    def test_swift_supports_both(self):
        assert supported_formats_for("SWIFT") == ["mt103", "pain001"]
        assert supported_formats_for("CHAPS") == ["mt103", "pain001"]

    def test_sepa_pain001_only(self):
        assert supported_formats_for("SEPA") == ["pain001"]

    def test_unknown_returns_empty(self):
        assert supported_formats_for("BOGUS") == []
