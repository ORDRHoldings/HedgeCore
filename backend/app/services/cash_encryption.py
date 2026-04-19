"""
AES-256-GCM field-level encryption for sensitive bank account fields.

Key derivation: PBKDF2-HMAC-SHA256(BANK_ACCOUNT_ENC_KEY, salt=company_id_bytes, 100_000 iter)
Per-encryption nonce: 12 random bytes (standard GCM nonce size)
Ciphertext format (base64): nonce(12) || tag(16) || ciphertext
"""
from __future__ import annotations

import base64
import os

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


def _derive_key(company_id: str) -> bytes:
    """Derive a 32-byte AES key for this tenant from BANK_ACCOUNT_ENC_KEY."""
    root_key = os.environ.get("BANK_ACCOUNT_ENC_KEY", "")
    if not root_key:
        raise RuntimeError(
            "BANK_ACCOUNT_ENC_KEY not set. "
            "Generate with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
        )
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=company_id.encode(),
        iterations=100_000,
    )
    return kdf.derive(root_key.encode())


def encrypt_field(plaintext: str, company_id: str) -> str:
    """Encrypt plaintext with AES-256-GCM. Returns base64-encoded nonce+tag+ciphertext."""
    key = _derive_key(company_id)
    nonce = os.urandom(12)
    aesgcm = AESGCM(key)
    ciphertext_with_tag = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(nonce + ciphertext_with_tag).decode()


def decrypt_field(ciphertext_b64: str | None, company_id: str) -> str | None:
    """Decrypt a value produced by encrypt_field. Returns None if input is None."""
    if ciphertext_b64 is None:
        return None
    key = _derive_key(company_id)
    raw = base64.b64decode(ciphertext_b64)
    nonce, ciphertext_with_tag = raw[:12], raw[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ciphertext_with_tag, None).decode()


def mask_account_number(value: str | None) -> str | None:
    """Return last-4 masked version, e.g. 'GB33...5555' -> '****5555'."""
    if value is None:
        return None
    return f"****{value[-4:]}"
