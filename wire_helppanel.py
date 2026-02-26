"""
wire_helppanel.py
Wires HelpPanel into all pages that don't have it yet.
For each page: adds import statements and inserts <HelpPanel ... /> before the closing wrapper.
"""
import os, re

BASE = r"D:\Synexiun\1-SynexFund\HedgeCalc\FXDemo\frontend\src\app"

# Pages to wire: (route_path, help_config_export, storage_key, outer_wrapper_hint)
# outer_wrapper_hint: a string we look for to find the closing </div> of the outermost flex container
PAGES = [
    # (page_dir, help_export, storage_key, needs_outer_flex_wrapper)
    # needs_outer_flex_wrapper=True: page needs a new flex div wrapper added
    # needs_outer_flex_wrapper=False: page already has a flex outer div (or we find the return's last </div>)
    ("dashboard",         "DASHBOARD_HELP",           "dashboard",         True),
    ("input",             "INPUT_HELP",                "input",             True),
    ("reports",           "REPORTS_HELP",              "reports",           True),
    ("results",           "RESULTS_HELP",              "results",           True),
    ("staging",           "STAGING_HELP",              "staging",           True),
    ("ledger",            "LEDGER_HELP",               "ledger",            True),
    ("hedges",            "HEDGES_HELP",               "hedges",            True),
    ("upload-csv",        "UPLOAD_CSV_HELP",           "upload-csv",        True),
    ("lineage",           "LINEAGE_HELP",              "lineage",           True),
    ("execution-history", "EXECUTION_HISTORY_HELP",    "execution-history", True),
    ("import-history",    "IMPORT_HISTORY_HELP",       "import-history",    True),
    ("access-control",    "ACCESS_CONTROL_HELP",       "access-control",    True),
    ("connectors",        "CONNECTORS_HELP",           "connectors",        True),
    ("erp-integration",   "ERP_INTEGRATION_HELP",      "erp-integration",   True),
    ("hedgewiki",         "HEDGEWIKI_HELP",             "hedgewiki",         True),
    ("polisophic",        "POLISOPHIC_HELP",            "polisophic",        True),
    ("terminal",          "TERMINAL_HELP",              "terminal",          True),
    ("database-connection","DATABASE_CONNECTION_HELP", "database-connection", True),
    ("help",              "HELP_CENTER_HELP",           "help-center",       True),
    ("portfolio-risk",    "PORTFOLIO_RISK_HELP",        "portfolio-risk",    False),  # already has panel
]

def has_helppanel(content):
    return "HelpPanel" in content and ("import HelpPanel" in content or "from" in content and "HelpPanel" in content)

def wire_page(page_dir, help_export, storage_key):
    page_file = os.path.join(BASE, page_dir, "page.tsx")
    if not os.path.exists(page_file):
        print(f"  SKIP (not found): {page_file}")
        return False

    with open(page_file, "r", encoding="utf-8") as f:
        content = f.read()

    if has_helppanel(content):
        print(f"  SKIP (already has HelpPanel): {page_dir}")
        return False

    # 1. Add HelpPanel import after first "use client" or first import line
    hp_import = 'import HelpPanel from "@/components/layout/HelpPanel";'
    hc_import = f'import {{ {help_export} }} from "@/lib/helpContent";'

    # Find position to insert imports — after the last existing import line
    lines = content.split("\n")
    last_import_idx = 0
    for i, line in enumerate(lines):
        if line.strip().startswith("import ") or line.strip().startswith('from "') or line.strip().startswith("from '"):
            last_import_idx = i

    # Check if imports already present
    if hp_import not in content:
        lines.insert(last_import_idx + 1, hp_import)
        last_import_idx += 1
    if hc_import not in content:
        lines.insert(last_import_idx + 1, hc_import)

    content = "\n".join(lines)

    # 2. Wrap return content in a flex div and add HelpPanel
    # Strategy: find the last return statement's outer JSX and wrap it
    # We look for the pattern: return (\n    <div  or  return (<div
    # and wrap the entire return block

    # Find the outermost return JSX — look for the closing pattern
    # "  );\n}" at the end of the component (last occurrence)

    # Simple approach: find last `  );\n}` or `  );\n}\n` which closes the return
    # and insert before the last closing </div>

    # Find last occurrence of closing pattern like `    </div>\n  );\n}`
    # We'll add a flex wrapper around the return body

    # Approach: find "  return (" and replace with a new wrapper
    # Actually safest: find the return statement and modify its outermost div

    # Pattern: the return JSX starts with return (\n and ends with );\n}
    # We find the last `return (` and rewrite it to:
    # return (
    #   <div style={{ display: 'flex', minHeight: '100vh' }}>
    #   [original content]
    #   <HelpPanel config={HELP_CONFIG} storageKey="key" />
    #   </div>
    # );

    # Find return block
    return_match = list(re.finditer(r'  return \(', content))
    if not return_match:
        return_match = list(re.finditer(r'  return\(', content))
    if not return_match:
        print(f"  WARN (no return found): {page_dir}")
        return False

    return_start = return_match[-1].start()

    # Find the matching closing ");" for this return
    # Count parens from return_start
    paren_depth = 0
    i = content.index("(", return_start)
    return_open = i
    while i < len(content):
        if content[i] == "(":
            paren_depth += 1
        elif content[i] == ")":
            paren_depth -= 1
            if paren_depth == 0:
                return_close = i
                break
        i += 1

    return_body = content[return_open + 1 : return_close]

    # Find the last </div> in return_body to insert before it
    last_div_close = return_body.rfind("</div>")
    if last_div_close == -1:
        print(f"  WARN (no </div> in return): {page_dir}")
        return False

    help_panel_jsx = f'\n    <HelpPanel config={{{help_export}}} storageKey="{storage_key}" />'

    # Check if already in a flex outer wrapper by looking at first child tag
    first_tag_match = re.search(r'<(\w+)', return_body.strip())
    first_tag = first_tag_match.group(1) if first_tag_match else ""

    # Check if the outermost div already has display:flex
    has_flex_wrapper = ("display: 'flex'" in return_body[:200] or
                        'display:"flex"' in return_body[:200] or
                        "display: \"flex\"" in return_body[:200])

    if not has_flex_wrapper:
        # Wrap in flex div
        indent = "  "
        new_return_body = (
            f"\n{indent}  <div style={{{{ display: 'flex', minHeight: '100vh' }}}}>\n"
            + return_body
            + help_panel_jsx
            + f"\n{indent}  </div>"
            + "\n" + indent
        )
    else:
        # Already has flex wrapper — just insert HelpPanel before last </div>
        new_return_body = (
            return_body[:last_div_close]
            + help_panel_jsx
            + "\n    "
            + return_body[last_div_close:]
        )

    new_content = (
        content[:return_open + 1]
        + new_return_body
        + content[return_close:]
    )

    with open(page_file, "w", encoding="utf-8") as f:
        f.write(new_content)

    print(f"  OK: {page_dir}")
    return True

# Pages that already have HelpPanel but need DASHBOARD_HELP wired
# (DASHBOARD_HELP and HEDGEWIKI_HELP exist in helpContent but pages don't import them)
MISSING_IMPORTS = [
    ("dashboard", "DASHBOARD_HELP", "dashboard"),
    ("hedgewiki",  "HEDGEWIKI_HELP",  "hedgewiki"),
]

print("=== Wiring HelpPanel into pages ===")
wired = 0
for page_dir, help_export, storage_key, _ in PAGES:
    page_file = os.path.join(BASE, page_dir, "page.tsx")
    if not os.path.exists(page_file):
        continue
    if wire_page(page_dir, help_export, storage_key):
        wired += 1

print(f"\nTotal pages wired: {wired}")

# Also wire /policies page (has HelpPanel component but missing the config at top level)
print("\n=== Checking /policies page ===")
policies_file = os.path.join(BASE, "policies", "page.tsx")
if os.path.exists(policies_file):
    with open(policies_file, "r", encoding="utf-8") as f:
        c = f.read()
    if "POLICY_LIBRARY_HELP" in c and "HelpPanel" in c:
        print("  OK: /policies already fully wired")
    else:
        print("  WARN: /policies missing full wiring")
