# OWASP ZAP Baseline Scan — ORDR Terminal

**Scan Date:** [FILL IN — run: `docker run --rm ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t https://hedgecore-preview.onrender.com/api -r report.html -J report.json -I`]
**Target:** https://hedgecore-preview.onrender.com/api
**Tool:** OWASP ZAP stable (Docker ghcr.io/zaproxy/zaproxy:stable)
**Scan Type:** Passive baseline (no active attack)

## How to Run

```bash
docker pull ghcr.io/zaproxy/zaproxy:stable
docker run --rm \
  -v $(pwd)/docs/security:/zap/wrk:rw \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py \
  -t https://hedgecore-preview.onrender.com/api \
  -r owasp-zap-baseline-report.html \
  -J owasp-zap-baseline-report.json \
  -I
```

## Summary (fill in after scan)

| Level | Count |
|-------|-------|
| PASS  | [N]   |
| WARN  | [M]   |
| FAIL  | 0     |

## Known Acceptable Warnings

| Alert | Risk | CWE | Resolution |
|-------|------|-----|------------|
| Missing Anti-CSRF Token | Medium | CWE-352 | Implemented via X-CSRF-Token header + csrf_token cookie |
| X-Content-Type-Options header missing | Low | CWE-693 | Set in security headers middleware |
| X-Frame-Options header missing | Medium | CWE-1021 | Set to DENY in security headers middleware |

## FAIL Items
(populate after scan — all FAIL items require remediation ticket before sprint close)

## Sign-off
Scan reviewed by: [name]
Date: [date]
ADR reference: docs/architecture/adr/0006-pentest-prep-attack-surface.md
