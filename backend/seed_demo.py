"""
seed_demo.py -- DEPRECATED

The demo/demo account is now provisioned by seed_company.py as a real
senior_analyst user inside the Synex Capital Partners company structure.

Run instead:
    python seed_company.py
    # or against Render:
    DATABASE_URL="postgresql+asyncpg://..." python seed_company.py

The demo account will be created with:
    email:    demo
    password: demo
    role:     senior_analyst
    branch:   Headquarters -- New York (NYC)
    dept:     FX Risk Desk (FXD)
    company:  Synex Capital Partners

All dashboard widgets and API endpoints return live data from the database.
No fake or static data is injected.
"""

print(
    "\n[seed_demo.py] This script is deprecated.\n"
    "Run seed_company.py instead — it creates demo/demo as a real\n"
    "senior_analyst account inside the full company structure.\n"
)
