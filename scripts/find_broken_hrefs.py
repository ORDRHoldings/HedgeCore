"""Static auditor for the frontend.

Checks the codebase for two regressions:

1. Broken hrefs / router.push() targets — every `/...` literal in `href=`,
   `router.push()`, `router.replace()`, or `redirect()` must resolve to an
   actual route under `frontend/src/app/`. Catches the class of bug
   from later13 (`/positions` → 404 because canonical was `/position-desk`).

2. Auth-guard hydration race — any block of the shape

        useEffect(() => {
          if (!user) router.push("/auth/login");
        }, [user, router]);

   that does not also depend on `isLoading` from `useAuth()`. Catches
   the class of bug from later14 (Trade History bounced authenticated
   users back to the login page during AuthProvider hydration).

Run from repo root: `python scripts/find_broken_hrefs.py`.
Exits non-zero if any issue is found, so it can be wired into CI later.
"""
from __future__ import annotations

import os
import re
import sys

APP_DIR = "frontend/src/app"
SRC = "frontend/src"

HREF_RE = re.compile(r'''href=["\']([\w/\-]+)["\']''')
NAV_RE = re.compile(
    r'''(?:router\.(?:push|replace)|redirect)\s*\(\s*["\']([\w/\-]+)["\']'''
)
# Guard pattern: `if (!user) router.push("/auth/login")` or `!token`.
# Multiline so `if (...` and the redirect can land on different lines.
AUTH_GUARD_RE = re.compile(
    r'''if\s*\(\s*!\s*(user|token)\b[^)]*\)\s*[\s\S]{0,40}?router\.(?:push|replace)\s*\(\s*["\']/auth/login["\']''',
    re.MULTILINE,
)


def list_routes() -> set[str]:
    routes: set[str] = set()
    for d in os.listdir(APP_DIR):
        p = os.path.join(APP_DIR, d)
        if os.path.isdir(p) and not d.startswith("_") and d != "api":
            routes.add("/" + d)
    return routes


def find_broken_navigation(routes: set[str]) -> dict[str, list[str]]:
    broken: dict[str, list[str]] = {}
    for root, _, files in os.walk(SRC):
        for f in files:
            if not f.endswith((".tsx", ".ts")):
                continue
            fp = os.path.join(root, f)
            try:
                with open(fp, "r", encoding="utf-8") as fh:
                    content = fh.read()
            except Exception:
                continue
            for rx in (HREF_RE, NAV_RE):
                for m in rx.finditer(content):
                    target = m.group(1)
                    if not target.startswith("/") or target.startswith("//"):
                        continue
                    top = "/" + target.lstrip("/").split("/")[0]
                    if top in ("/api", "/"):
                        continue
                    if top not in routes:
                        broken.setdefault(target, []).append(fp)
    return broken


def find_unguarded_auth_races() -> list[tuple[str, int, str]]:
    """Return (file, line_no, snippet) for any auth-redirect block that
    is missing an `isLoading`/`authLoading`/`isReady` check."""
    findings: list[tuple[str, int, str]] = []
    for root, _, files in os.walk(SRC):
        for f in files:
            if not f.endswith((".tsx", ".ts")):
                continue
            fp = os.path.join(root, f)
            try:
                with open(fp, "r", encoding="utf-8") as fh:
                    content = fh.read()
            except Exception:
                continue
            for m in AUTH_GUARD_RE.finditer(content):
                snippet = m.group(0)
                # If the guarded condition already references a loading flag,
                # consider it safe (e.g. `!authLoading && !user`).
                if re.search(r"\b(isLoading|authLoading|isReady|hydrated)\b", snippet):
                    continue
                line_no = content[: m.start()].count("\n") + 1
                findings.append((fp, line_no, snippet.replace("\n", " ")[:120]))
    return findings


def main() -> int:
    routes = list_routes()

    broken = find_broken_navigation(routes)
    races = find_unguarded_auth_races()

    if broken:
        print("BROKEN HREF / NAV TARGETS:")
        for target, files in sorted(broken.items()):
            print(f"  {target} -> {sorted(set(files))[:5]}")
    else:
        print("No broken href / nav targets.")

    print()
    if races:
        print("UNGUARDED AUTH-REDIRECT BLOCKS (missing isLoading check):")
        for fp, line_no, snippet in races:
            print(f"  {fp}:{line_no}")
            print(f"    {snippet}")
    else:
        print("No unguarded auth-redirect blocks.")

    return 1 if (broken or races) else 0


if __name__ == "__main__":
    sys.exit(main())
