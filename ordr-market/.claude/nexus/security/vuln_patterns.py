"""NEXUS security: OWASP vulnerability pattern catalog and scanner."""
import re
from typing import Optional


# ── Vulnerability Pattern Definitions ─────────────────────────────────

# Each entry: (vuln_name, severity, file_types, regex_pattern, suggestion)
_VULN_CATALOG: list[tuple[str, str, list[str], re.Pattern, str]] = [
    (
        "SQL Injection",
        "CRITICAL",
        ["py"],
        re.compile(
            r"(?:"
            r"execute\s*\(\s*f['\"]"          # cursor.execute(f"...")
            r"|execute\s*\(\s*['\"].*?\%s"     # execute("...%s" % ...)
            r"|execute\s*\(\s*.*?\+\s*"        # execute(query + user_input)
            r"|\.format\s*\(.*?(?:SELECT|INSERT|UPDATE|DELETE)"  # .format() with SQL
            r")",
            re.IGNORECASE,
        ),
        "Use parameterized queries (cursor.execute('SELECT ? ...', (param,))) instead of string concatenation.",
    ),
    (
        "XSS",
        "HIGH",
        ["js", "ts", "jsx", "tsx", "html"],
        re.compile(
            r"(?:"
            r"innerHTML\s*="                   # elem.innerHTML = ...
            r"|dangerouslySetInnerHTML"         # React escape hatch
            r"|document\.write\s*\("           # document.write(...)
            r"|\.html\s*\(\s*[^)]*\$"          # jQuery .html($var)
            r")",
            re.IGNORECASE,
        ),
        "Sanitize user input before inserting into DOM. Use textContent or a sanitization library.",
    ),
    (
        "Command Injection",
        "CRITICAL",
        ["py"],
        re.compile(
            r"(?:"
            r"os\.system\s*\("                 # os.system(...)
            r"|os\.popen\s*\("                 # os.popen(...)
            r"|subprocess\.\w+\s*\([^)]*shell\s*=\s*True"  # subprocess with shell=True
            r")",
            re.IGNORECASE,
        ),
        "Use subprocess.run() with shell=False and pass arguments as a list.",
    ),
    (
        "Path Traversal",
        "HIGH",
        ["py"],
        re.compile(
            r"(?:"
            r"open\s*\(\s*(?:request\.|args\[|form\[|params\[|user_input)"  # open() with user input
            r"|os\.path\.join\s*\([^)]*(?:request\.|args\[|form\[)"         # path.join with user input
            r"|send_file\s*\(\s*(?:request\.|args\[)"                       # send_file with user input
            r")",
            re.IGNORECASE,
        ),
        "Validate and sanitize file paths. Use os.path.realpath() and check against allowed directories.",
    ),
    (
        "Insecure Deserialization",
        "CRITICAL",
        ["py"],
        re.compile(
            r"(?:"
            r"pickle\.loads?\s*\("              # pickle.load(s)
            r"|yaml\.load\s*\([^)]*(?!Loader\s*=\s*yaml\.SafeLoader)"  # yaml.load without SafeLoader
            r"|marshal\.loads?\s*\("            # marshal.load(s)
            r"|shelve\.open\s*\("               # shelve.open
            r")",
            re.IGNORECASE,
        ),
        "Use yaml.safe_load() instead of yaml.load(). Avoid pickle/marshal for untrusted data.",
    ),
    (
        "SSRF",
        "HIGH",
        ["py"],
        re.compile(
            r"(?:"
            r"requests\.(?:get|post|put|delete|patch)\s*\(\s*(?:request\.|args\[|form\[|user)"
            r"|urllib\.request\.urlopen\s*\(\s*(?:request\.|args\[|form\[)"
            r"|httpx\.\w+\s*\(\s*(?:request\.|args\[|form\[)"
            r")",
            re.IGNORECASE,
        ),
        "Validate and allowlist URLs before making requests. Block internal network addresses.",
    ),
    (
        "Hardcoded Credentials",
        "HIGH",
        ["py", "js", "ts", "jsx", "tsx", "yaml", "yml", "json", "toml", "cfg", "ini"],
        re.compile(
            r"(?:"
            r"(?:password|passwd|pwd)\s*=\s*['\"][^'\"]{4,}"   # password = "..."
            r"|(?:secret|api_key|apikey)\s*=\s*['\"][^'\"]{8,}" # secret = "..."
            r"|(?:token)\s*=\s*['\"][^'\"]{10,}"               # token = "..."
            r")",
            re.IGNORECASE,
        ),
        "Use environment variables or a secrets manager instead of hardcoded credentials.",
    ),
    (
        "Missing Input Validation",
        "MEDIUM",
        ["py"],
        re.compile(
            r"(?:"
            r"request\.args\.get\s*\([^)]+\)\s*(?!\s*(?:if|and|or|\.))"     # request.args.get() used directly
            r"|request\.form\.get\s*\([^)]+\)\s*(?!\s*(?:if|and|or|\.))"    # request.form.get() used directly
            r"|request\.args\s*\["                                           # request.args[key] direct access
            r"|request\.form\s*\["                                           # request.form[key] direct access
            r")",
            re.IGNORECASE,
        ),
        "Validate and sanitize all user input. Use schema validation (marshmallow, pydantic).",
    ),
]


# ── Scanning Functions ────────────────────────────────────────────────

def scan_for_vulnerabilities(
    content: str, file_type: str = "py"
) -> list[tuple[str, str, int, str]]:
    """Scan content for OWASP vulnerability patterns.

    Args:
        content: Source code content to scan.
        file_type: File extension (without dot) to filter applicable patterns.

    Returns:
        List of (vuln_name, severity, line_number, suggestion) tuples.
    """
    findings = []
    lines = content.splitlines()
    file_type_lower = file_type.lower().lstrip(".")

    for vuln_name, severity, file_types, pattern, suggestion in _VULN_CATALOG:
        if file_type_lower not in file_types:
            continue
        for line_num, line in enumerate(lines, start=1):
            # Skip comment lines
            stripped = line.strip()
            if stripped.startswith("#") or stripped.startswith("//"):
                continue
            if pattern.search(line):
                findings.append((vuln_name, severity, line_num, suggestion))

    return findings


def get_vuln_catalog() -> list[dict]:
    """Return the full vulnerability catalog for reference.

    Each entry contains:
        - name: Vulnerability name
        - severity: CRITICAL, HIGH, MEDIUM, or LOW
        - file_types: Applicable file extensions
        - suggestion: Recommended fix
    """
    return [
        {
            "name": vuln_name,
            "severity": severity,
            "file_types": file_types,
            "suggestion": suggestion,
        }
        for vuln_name, severity, file_types, _, suggestion in _VULN_CATALOG
    ]
