"""
Unit tests for custom_report_template_service (P2-B).

Pure-function validator coverage. CRUD happy-path is tested via the route
integration tests; this suite focuses on validation logic which is the only
non-trivial branch in the service.
"""
from __future__ import annotations

import pytest

from app.services.custom_report_template_service import (
    CustomReportTemplateError,
    MAX_SECTIONS,
    validate_audience,
    validate_category,
    validate_section,
    validate_sections,
)


# ── Section validation ───────────────────────────────────────────────

def test_section_rejects_non_dict():
    with pytest.raises(CustomReportTemplateError, match="must be an object"):
        validate_section("not a dict", 0)


def test_section_rejects_unknown_type():
    with pytest.raises(CustomReportTemplateError, match="SectionType"):
        validate_section(
            {"type": "UNKNOWN_TYPE", "title": "X", "order": 0}, 0
        )


def test_section_rejects_empty_title():
    with pytest.raises(CustomReportTemplateError, match="title"):
        validate_section(
            {"type": "EXECUTIVE_SUMMARY", "title": "", "order": 0}, 0
        )


def test_section_rejects_whitespace_only_title():
    with pytest.raises(CustomReportTemplateError, match="title"):
        validate_section(
            {"type": "EXECUTIVE_SUMMARY", "title": "   ", "order": 0}, 0
        )


def test_section_rejects_negative_order():
    with pytest.raises(CustomReportTemplateError, match="order"):
        validate_section(
            {"type": "EXECUTIVE_SUMMARY", "title": "X", "order": -1}, 0
        )


def test_section_rejects_non_integer_order():
    with pytest.raises(CustomReportTemplateError, match="order"):
        validate_section(
            {"type": "EXECUTIVE_SUMMARY", "title": "X", "order": 1.5}, 0
        )


def test_section_rejects_bad_status():
    with pytest.raises(CustomReportTemplateError, match="status"):
        validate_section(
            {
                "type": "EXECUTIVE_SUMMARY",
                "title": "X",
                "order": 0,
                "status": "WEIRD",
            },
            0,
        )


def test_section_accepts_valid_minimal_spec():
    out = validate_section(
        {"type": "HEDGE_PLAN_TABLE", "title": "Hedge Plan", "order": 2}, 0
    )
    # Default status filled in
    assert out["status"] == "INCLUDED"
    # Default page_break filled in as False
    assert out["page_break_before"] is False
    assert out["title"] == "Hedge Plan"


def test_section_trims_title_and_caps_length():
    long_title = "  " + ("A" * 500) + "  "
    out = validate_section(
        {"type": "COVER_PAGE", "title": long_title, "order": 0}, 0
    )
    # Stripped + capped at 200 chars
    assert out["title"].startswith("A")
    assert len(out["title"]) == 200


def test_section_accepts_page_break_before():
    out = validate_section(
        {
            "type": "DISCLOSURES", "title": "Disclosures",
            "order": 5, "page_break_before": True,
        },
        0,
    )
    assert out["page_break_before"] is True


# ── Sections list validation ─────────────────────────────────────────

def test_sections_rejects_empty_list():
    with pytest.raises(CustomReportTemplateError, match="non-empty"):
        validate_sections([])


def test_sections_rejects_non_list():
    with pytest.raises(CustomReportTemplateError, match="non-empty"):
        validate_sections("not a list")


def test_sections_rejects_over_max_length():
    too_many = [
        {"type": "EXECUTIVE_SUMMARY", "title": f"Sec {i}", "order": i}
        for i in range(MAX_SECTIONS + 1)
    ]
    with pytest.raises(CustomReportTemplateError, match="max length"):
        validate_sections(too_many)


def test_sections_propagates_child_index_in_error():
    sections = [
        {"type": "EXECUTIVE_SUMMARY", "title": "OK", "order": 0},
        {"type": "NOT_A_TYPE", "title": "Bad", "order": 1},
    ]
    with pytest.raises(CustomReportTemplateError, match=r"section\[1\]"):
        validate_sections(sections)


def test_sections_returns_canonical_list():
    sections = [
        {"type": "COVER_PAGE", "title": "Cover", "order": 0},
        {"type": "EXECUTIVE_SUMMARY", "title": "ES", "order": 1, "status": "DRAFT"},
    ]
    out = validate_sections(sections)
    assert len(out) == 2
    assert out[0]["status"] == "INCLUDED"   # default filled
    assert out[1]["status"] == "DRAFT"


# ── Category / audience ──────────────────────────────────────────────

def test_category_accepts_valid_enum():
    assert validate_category("TREASURY_FX") == "TREASURY_FX"


def test_category_rejects_unknown():
    with pytest.raises(CustomReportTemplateError, match="category"):
        validate_category("WAT")


def test_audience_defaults_to_empty_list():
    assert validate_audience(None) == []


def test_audience_accepts_valid_enum_values():
    out = validate_audience(["BOARD", "CFO"])
    assert out == ["BOARD", "CFO"]


def test_audience_rejects_unknown_value():
    with pytest.raises(CustomReportTemplateError, match="audience"):
        validate_audience(["BOARD", "JANITOR"])


def test_audience_rejects_non_list():
    with pytest.raises(CustomReportTemplateError, match="list"):
        validate_audience("BOARD")
