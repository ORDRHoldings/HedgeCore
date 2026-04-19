"""Tests for AES-256-GCM encryption helpers."""
import os
import pytest


@pytest.fixture(autouse=True)
def set_enc_key(monkeypatch):
    monkeypatch.setenv("BANK_ACCOUNT_ENC_KEY", "test-bank-enc-key-at-least-32-bytes-long!!")


def test_encrypt_decrypt_roundtrip():
    from app.services.cash_encryption import encrypt_field, decrypt_field
    company_id = "550e8400-e29b-41d4-a716-446655440000"
    plaintext = "GB33BUKB20201555555555"
    ciphertext = encrypt_field(plaintext, company_id)
    assert ciphertext != plaintext
    assert decrypt_field(ciphertext, company_id) == plaintext


def test_encrypt_produces_different_ciphertext_each_call():
    from app.services.cash_encryption import encrypt_field
    company_id = "550e8400-e29b-41d4-a716-446655440000"
    c1 = encrypt_field("GB33BUKB20201555555555", company_id)
    c2 = encrypt_field("GB33BUKB20201555555555", company_id)
    assert c1 != c2  # random nonce per encryption


def test_decrypt_none_returns_none():
    from app.services.cash_encryption import decrypt_field
    assert decrypt_field(None, "any-company") is None


def test_mask_account_number():
    from app.services.cash_encryption import mask_account_number
    assert mask_account_number("GB33BUKB20201555555555") == "****5555"
    assert mask_account_number("1234") == "****1234"
    assert mask_account_number(None) is None
