"""Deterministic SHA-256 hashing for audit trail."""

from __future__ import annotations

import hashlib
import json

import pandas as pd


def sha256_of_dict(d: dict) -> str:
    canonical = json.dumps(d, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def sha256_of_dataframe(df: pd.DataFrame) -> str:
    canonical = df.to_json(orient="records", date_format="iso")
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def sha256_of_list(items: list) -> str:
    canonical = json.dumps(items, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
