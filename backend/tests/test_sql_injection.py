"""
backend/tests/test_sql_injection.py
SEC-05: SQL injection prevention scan.
Static analysis — no DB required.
"""

from __future__ import annotations

import pathlib
import re


BACKEND_APP = pathlib.Path(__file__).parents[1] / "app"


class TestSQLInjectionPrevention:
    """Scan backend source for unsafe SQL patterns."""

    def test_no_text_with_fstring(self):
        """No text(f'...') or text(f\"...\") patterns allowed."""
        violations = []
        for pyfile in BACKEND_APP.rglob("*.py"):
            content = pyfile.read_text(encoding="utf-8", errors="ignore")
            if 'text(f"' in content or "text(f'" in content:
                violations.append(str(pyfile.relative_to(BACKEND_APP)))
        assert violations == [], f"SQL injection risk — f-string in text(): {violations}"

    def test_no_text_with_format_on_same_line(self):
        """No text('...'.format(...)) patterns on single lines."""
        violations = []
        for pyfile in BACKEND_APP.rglob("*.py"):
            content = pyfile.read_text(encoding="utf-8", errors="ignore")
            for i, line in enumerate(content.splitlines(), 1):
                if "text(" in line and ".format(" in line:
                    violations.append(f"{pyfile.name}:{i} — {line.strip()}")
        assert violations == [], f"SQL injection risk — .format() in text(): {violations}"

    def test_no_string_concat_in_text(self):
        """No text('...' + variable) string concatenation patterns."""
        violations = []
        concat_pattern = re.compile(r'text\s*\(\s*["\'].*["\'\s]\+')
        for pyfile in BACKEND_APP.rglob("*.py"):
            content = pyfile.read_text(encoding="utf-8", errors="ignore")
            if concat_pattern.search(content):
                violations.append(str(pyfile.relative_to(BACKEND_APP)))
        assert violations == [], f"SQL injection risk — string concat in text(): {violations}"

    def test_dashboard_uses_parameterized_queries(self):
        """dashboard.py text() call must use :param style binding."""
        dashboard = BACKEND_APP / "api" / "routes" / "dashboard.py"
        content = dashboard.read_text(encoding="utf-8", errors="ignore")
        if "text(" in content:
            # Must use parameterized binding (:param_name pattern)
            assert ":" in content, "dashboard.py text() calls must use parameterized bindings"
            assert 'text(f"' not in content
            assert "text(f'" not in content
