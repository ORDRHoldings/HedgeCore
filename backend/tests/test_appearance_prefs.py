"""Tests for appearance preferences helpers and route contracts."""
import pytest
from app.api.routes.v1_ui import (
    get_appearance_defaults,
    get_appearance_from_prefs,
    apply_appearance_update,
    VALID_THEME_IDS,
    VALID_MODES,
    VALID_ACCENTS,
    VALID_DENSITIES,
)

class TestAppearanceDefaults:
    def test_defaults_has_all_keys(self):
        d = get_appearance_defaults()
        assert "theme_id" in d
        assert "density" in d
        assert "tabular_numerals" in d
        assert d["theme_id"] == "institutional-obsidian"
        assert d["density"] == "standard"
        assert d["tabular_numerals"] is True

    def test_defaults_valid_values(self):
        d = get_appearance_defaults()
        assert d["theme_id"] in VALID_THEME_IDS
        assert d["mode_override"] in VALID_MODES
        assert d["accent_id"] in VALID_ACCENTS
        assert d["density"] in VALID_DENSITIES
        assert 12 <= d["base_font_size"] <= 16

class TestGetAppearance:
    def test_none_prefs_returns_defaults(self):
        result = get_appearance_from_prefs(None)
        assert result == get_appearance_defaults()

    def test_empty_prefs_returns_defaults(self):
        result = get_appearance_from_prefs({})
        assert result == get_appearance_defaults()

    def test_partial_prefs_merged(self):
        prefs = {"appearance": {"theme_id": "algorithmic-slate", "density": "compact"}}
        result = get_appearance_from_prefs(prefs)
        assert result["theme_id"] == "algorithmic-slate"
        assert result["density"] == "compact"
        assert result["tabular_numerals"] is True  # default preserved

    def test_unknown_keys_ignored(self):
        prefs = {"appearance": {"theme_id": "ordr-default", "unknown_key": "value"}}
        result = get_appearance_from_prefs(prefs)
        assert "unknown_key" not in result

class TestApplyUpdate:
    def test_merge_single_field(self):
        existing = get_appearance_defaults()
        updated = apply_appearance_update(existing, {"density": "compact"})
        assert updated["density"] == "compact"
        assert updated["theme_id"] == "institutional-obsidian"  # unchanged

    def test_invalid_theme_rejected(self):
        existing = get_appearance_defaults()
        updated = apply_appearance_update(existing, {"theme_id": "invalid-theme"})
        assert updated["theme_id"] == "institutional-obsidian"  # unchanged

    def test_invalid_density_rejected(self):
        existing = get_appearance_defaults()
        updated = apply_appearance_update(existing, {"density": "ultra-wide"})
        assert updated["density"] == "standard"  # unchanged

    def test_font_size_clamped(self):
        existing = get_appearance_defaults()
        updated = apply_appearance_update(existing, {"base_font_size": 20})
        assert updated["base_font_size"] == 16  # clamped to max

    def test_font_size_clamped_min(self):
        existing = get_appearance_defaults()
        updated = apply_appearance_update(existing, {"base_font_size": 8})
        assert updated["base_font_size"] == 12  # clamped to min

    def test_boolean_fields(self):
        existing = get_appearance_defaults()
        updated = apply_appearance_update(existing, {
            "tabular_numerals": False,
            "reduced_motion": True,
            "high_contrast": True,
        })
        assert updated["tabular_numerals"] is False
        assert updated["reduced_motion"] is True
        assert updated["high_contrast"] is True

    def test_template_id_set(self):
        existing = get_appearance_defaults()
        updated = apply_appearance_update(existing, {"template_id": "trading-floor"})
        assert updated["template_id"] == "trading-floor"

    def test_none_values_ignored(self):
        existing = get_appearance_defaults()
        updated = apply_appearance_update(existing, {"density": None})
        assert updated["density"] == "standard"  # unchanged

class TestValidationConstants:
    def test_theme_ids(self):
        assert len(VALID_THEME_IDS) == 7
        assert "ordr-default" in VALID_THEME_IDS

    def test_modes(self):
        assert "system" in VALID_MODES
        assert "dark" in VALID_MODES
        assert "light" in VALID_MODES

    def test_accents(self):
        assert len(VALID_ACCENTS) == 8

    def test_densities(self):
        assert len(VALID_DENSITIES) == 3
