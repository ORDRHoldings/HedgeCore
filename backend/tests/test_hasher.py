"""Tests for engine_v1/hasher.py — deterministic SHA-256 audit hashing."""

import pandas as pd
import pytest

from app.engine_v1.hasher import sha256_of_dataframe, sha256_of_dict, sha256_of_list


class TestSha256OfDict:
    def test_basic(self):
        h = sha256_of_dict({"a": 1, "b": 2})
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)

    def test_deterministic(self):
        assert sha256_of_dict({"x": 1}) == sha256_of_dict({"x": 1})

    def test_key_order_invariant(self):
        """sort_keys=True means insertion order does not affect the hash."""
        assert sha256_of_dict({"a": 1, "b": 2}) == sha256_of_dict({"b": 2, "a": 1})

    def test_different_values_differ(self):
        assert sha256_of_dict({"a": 1}) != sha256_of_dict({"a": 2})


class TestSha256OfDataframe:
    def test_basic(self):
        df = pd.DataFrame({"a": [1, 2], "b": [3, 4]})
        h = sha256_of_dataframe(df)
        assert len(h) == 64

    def test_deterministic(self):
        df1 = pd.DataFrame({"a": [1, 2], "b": [3, 4]})
        df2 = pd.DataFrame({"a": [1, 2], "b": [3, 4]})
        assert sha256_of_dataframe(df1) == sha256_of_dataframe(df2)

    def test_column_order_invariant(self):
        """
        Regression test: DataFrames with identical data but columns in different
        insertion order must produce the same hash.

        Before the fix, to_json(orient='records') serialised columns in insertion
        order, so df[['a','b']] and df[['b','a']] produced different hashes for
        the same logical dataset — breaking replay determinism.
        """
        df_ab = pd.DataFrame({"a": [1, 2], "b": [3, 4]})
        df_ba = df_ab[["b", "a"]]  # same data, different column order
        assert sha256_of_dataframe(df_ab) == sha256_of_dataframe(df_ba)

    def test_different_data_differs(self):
        df1 = pd.DataFrame({"a": [1], "b": [2]})
        df2 = pd.DataFrame({"a": [9], "b": [2]})
        assert sha256_of_dataframe(df1) != sha256_of_dataframe(df2)

    def test_row_order_matters(self):
        """Row order IS significant — same columns, different row order → different hash."""
        df1 = pd.DataFrame({"a": [1, 2], "b": [3, 4]})
        df2 = pd.DataFrame({"a": [2, 1], "b": [4, 3]})
        assert sha256_of_dataframe(df1) != sha256_of_dataframe(df2)

    def test_empty_dataframe(self):
        df = pd.DataFrame({"a": pd.Series([], dtype=float)})
        h = sha256_of_dataframe(df)
        assert len(h) == 64


class TestSha256OfList:
    def test_basic(self):
        h = sha256_of_list([1, 2, 3])
        assert len(h) == 64

    def test_deterministic(self):
        assert sha256_of_list([1, 2]) == sha256_of_list([1, 2])

    def test_order_matters(self):
        assert sha256_of_list([1, 2]) != sha256_of_list([2, 1])
