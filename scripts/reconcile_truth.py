#!/usr/bin/env python3
"""Truth reconciliation: compares repo reality against state files and memory.db.

Reports: ALIGNED, STALE, CONTRADICTION, NOT VERIFIED
"""
import os
import re
import sqlite3
import json
import glob as globmod
from datetime import datetime, timezone

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(REPO, ".claude", "state", "memory.db")
STATE = os.path.join(REPO, ".claude", "state", "CURRENT_STATE.md")
SETTINGS = os.path.join(REPO, ".claude", "settings.json")

results = []


def check(name, status, detail):
    results.append((name, status, detail))
    symbol = {"ALIGNED": "+", "STALE": "~", "CONTRADICTION": "!", "NOT VERIFIED": "?"}
    print(f"  [{symbol.get(status, '?')}] {name}: {status} — {detail}")


def count_files(pattern, base=REPO):
    return len([f for f in globmod.glob(os.path.join(base, pattern)) if f.endswith(".py")])


def read_state_value(pattern):
    """Extract a value from CURRENT_STATE.md matching a pattern."""
    if not os.path.exists(STATE):
        return None
    with open(STATE) as f:
        for line in f:
            m = re.search(pattern, line)
            if m:
                return m.group(1)
    return None


def main():
    print(f"TRUTH RECONCILIATION — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}")
    print()

    # 1. Engine module counts
    engine_count = count_files("backend/app/engine/*.py") - (1 if os.path.exists(os.path.join(REPO, "backend/app/engine/__init__.py")) else 0)
    engine_v1_count = count_files("backend/app/engine_v1/*.py") - (1 if os.path.exists(os.path.join(REPO, "backend/app/engine_v1/__init__.py")) else 0)
    claimed_engine = read_state_value(r"engine/:\s*(\d+)")
    claimed_engine_v1 = read_state_value(r"engine_v1/:\s*(\d+)")

    if claimed_engine and int(claimed_engine) == engine_count:
        check("engine/ count", "ALIGNED", f"{engine_count} modules")
    elif claimed_engine:
        check("engine/ count", "CONTRADICTION", f"claimed {claimed_engine}, actual {engine_count}")
    else:
        check("engine/ count", "NOT VERIFIED", f"actual {engine_count}, no claim in state")

    if claimed_engine_v1 and int(claimed_engine_v1) == engine_v1_count:
        check("engine_v1/ count", "ALIGNED", f"{engine_v1_count} modules")
    elif claimed_engine_v1:
        check("engine_v1/ count", "CONTRADICTION", f"claimed {claimed_engine_v1}, actual {engine_v1_count}")
    else:
        check("engine_v1/ count", "NOT VERIFIED", f"actual {engine_v1_count}")

    # 2. Route file count
    route_count = count_files("backend/app/api/routes/*.py")
    claimed_routes = read_state_value(r"routes/:\s*(\d+)")
    if claimed_routes and int(claimed_routes) == route_count:
        check("routes/ count", "ALIGNED", f"{route_count} files")
    elif claimed_routes:
        check("routes/ count", "STALE", f"claimed {claimed_routes}, actual {route_count}")
    else:
        check("routes/ count", "NOT VERIFIED", f"actual {route_count}")

    # 3. Model file count
    model_count = count_files("backend/app/models/*.py")
    claimed_models = read_state_value(r"models/:\s*(\d+)")
    if claimed_models and int(claimed_models) == model_count:
        check("models/ count", "ALIGNED", f"{model_count} files")
    elif claimed_models:
        check("models/ count", "STALE", f"claimed {claimed_models}, actual {model_count}")
    else:
        check("models/ count", "NOT VERIFIED", f"actual {model_count}")

    # 4. Widget count
    widget_file = os.path.join(REPO, "frontend/src/lib/widgets/widgetRegistry.ts")
    if os.path.exists(widget_file):
        with open(widget_file) as f:
            content = f.read()
        widget_count = len(re.findall(r'id:\s*"', content))
        claimed_widgets = read_state_value(r"Widgets.*?:\s*(\d+)")
        if claimed_widgets and int(claimed_widgets) == widget_count:
            check("widget count", "ALIGNED", f"{widget_count} widgets")
        elif claimed_widgets:
            check("widget count", "STALE", f"claimed {claimed_widgets}, actual {widget_count}")
        else:
            check("widget count", "NOT VERIFIED", f"actual {widget_count}")

    # 5. DDL table count
    main_py = os.path.join(REPO, "backend/app/main.py")
    if os.path.exists(main_py):
        with open(main_py) as f:
            content = f.read()
        ddl_count = len(re.findall(r"CREATE TABLE IF NOT EXISTS", content))
        claimed_ddl = read_state_value(r"DDL tables.*?:\s*(\d+)")
        if claimed_ddl and int(claimed_ddl) == ddl_count:
            check("DDL table count", "ALIGNED", f"{ddl_count} tables")
        elif claimed_ddl:
            check("DDL table count", "STALE", f"claimed {claimed_ddl}, actual {ddl_count}")
        else:
            check("DDL table count", "NOT VERIFIED", f"actual {ddl_count}")

    # 6. Settings.json validity
    if os.path.exists(SETTINGS):
        try:
            with open(SETTINGS) as f:
                json.load(f)
            check("settings.json", "ALIGNED", "valid JSON")
        except json.JSONDecodeError as e:
            check("settings.json", "CONTRADICTION", f"invalid JSON: {e}")
    else:
        check("settings.json", "NOT VERIFIED", "file not found")

    # 7. Hook wiring
    if os.path.exists(SETTINGS):
        with open(SETTINGS) as f:
            settings = json.load(f)
        hooks = settings.get("hooks", {})
        event_count = len(hooks)
        cmd_count = sum(len(entry.get("hooks", [])) for group in hooks.values() for entry in group)
        check("hooks wired", "ALIGNED", f"{cmd_count} commands across {event_count} events")

    # 8. Freeze guard patterns vs rules file
    guard_file = os.path.join(REPO, ".claude/hooks/pretool_freeze_guard.py")
    rules_file = os.path.join(REPO, ".claude/rules/architecture.md")
    if os.path.exists(guard_file) and os.path.exists(rules_file):
        with open(guard_file) as f:
            guard_content = f.read()
        guard_patterns = re.findall(r'"([^"]+\.py)"', guard_content.split("FROZEN_PATTERNS")[1].split("]")[0])
        with open(rules_file) as f:
            rules_content = f.read()
        rules_patterns = re.findall(r'`backend/app/([^`]+\.py)`', rules_content)
        guard_set = set(guard_patterns)
        rules_set = set(rules_patterns)
        if guard_set == rules_set:
            check("freeze guard vs rules", "ALIGNED", f"{len(guard_set)} patterns match")
        else:
            missing = rules_set - guard_set
            extra = guard_set - rules_set
            detail = ""
            if missing:
                detail += f"in rules but not guard: {missing}"
            if extra:
                detail += f" in guard but not rules: {extra}"
            check("freeze guard vs rules", "CONTRADICTION", detail.strip())

    # 9. Skill count
    skill_dirs = [d for d in globmod.glob(os.path.join(REPO, ".claude/skills/*/")) if os.path.isdir(d)]
    skill_count = len(skill_dirs)
    claimed_skills = read_state_value(r"Skills:\s*(\d+)")
    if claimed_skills and int(claimed_skills) == skill_count:
        check("skill count", "ALIGNED", f"{skill_count} skills")
    elif claimed_skills:
        check("skill count", "STALE", f"claimed {claimed_skills}, actual {skill_count}")
    else:
        check("skill count", "NOT VERIFIED", f"actual {skill_count}")

    # 10. Agent count
    agent_files = globmod.glob(os.path.join(REPO, ".claude/agents/*.md"))
    agent_count = len(agent_files)
    claimed_agents = read_state_value(r"Agents:\s*(\d+)")
    if claimed_agents and int(claimed_agents) == agent_count:
        check("agent count", "ALIGNED", f"{agent_count} agents")
    elif claimed_agents:
        check("agent count", "STALE", f"claimed {claimed_agents}, actual {agent_count}")
    else:
        check("agent count", "NOT VERIFIED", f"actual {agent_count}")

    # 11. memory.db health
    if os.path.exists(DB):
        conn = sqlite3.connect(DB)
        tables = [t[0] for t in conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()]
        check("memory.db tables", "ALIGNED", f"{len(tables)} tables")

        # Check for empty tables that should have data
        for tbl in ["work_items", "architecture_freeze", "open_risks", "skills_registry"]:
            if tbl in tables:
                count = conn.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
                if count == 0:
                    check(f"memory.db {tbl}", "STALE", "0 rows — should be populated")
                else:
                    check(f"memory.db {tbl}", "ALIGNED", f"{count} rows")
        conn.close()

    # Summary
    print()
    aligned = sum(1 for _, s, _ in results if s == "ALIGNED")
    stale = sum(1 for _, s, _ in results if s == "STALE")
    contradictions = sum(1 for _, s, _ in results if s == "CONTRADICTION")
    unverified = sum(1 for _, s, _ in results if s == "NOT VERIFIED")
    print(f"Summary: {aligned} aligned, {stale} stale, {contradictions} contradictions, {unverified} not verified")

    # Record to memory.db
    if os.path.exists(DB):
        conn = sqlite3.connect(DB)
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        detail = json.dumps({r[0]: r[1] for r in results})
        conn.execute(
            "INSERT INTO validation_runs (run_date, run_type, result, details) VALUES (?,?,?,?)",
            (now, "reconciliation", "pass" if contradictions == 0 else "fail", detail),
        )
        conn.commit()
        conn.close()

    return 1 if contradictions > 0 else 0


if __name__ == "__main__":
    exit(main())
