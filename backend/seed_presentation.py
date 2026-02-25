"""
seed_presentation.py
====================
Creates a presentation-ready data set for Synex Capital Partners.

Presentation account (Head of FX Risk — Sarah Williams):
    email:    s.williams@synexcapital.com
    password: SWill@2026!
    role:     head_of_risk
    branch:   Headquarters -- New York (NYC)
    dept:     FX Risk Desk (FXD)

This person can:
  - View all branches (company-wide KPIs)
  - Create / save AI policy templates
  - Activate policy for her branch
  - Approve/reject pipeline proposals
  - Run production calculations

What this script seeds:
  - 120 realistic FX positions spread across all 3 branches and all 3
    currencies (MXN, BRL, EUR) in both AR and AP, mix of CONFIRMED /
    FORECAST, different entities and value dates spanning 6 months
  - All positions start at execution_status=NEW — no policy assigned yet
  - The manager (presenter) assigns policy and drives the workflow live

Designed so the dashboard immediately shows:
  - KPI widget: 120 total positions, live exposure, 0 coverage (no policy)
  - Exposure widget: MXN / BRL / EUR breakdown
  - Pipeline widget: 120 in sandbox, 0 in staging, 0 in ledger
  - Recent Runs: empty (no calc runs yet)
  - Team Activity: seed + any ops done by presenter

Usage:
    # Against Render production DB:
    DATABASE_URL="postgresql+asyncpg://..." python seed_presentation.py

    # Against local DB:
    python seed_presentation.py
"""
from __future__ import annotations

import asyncio
import logging
import os
import random
import sys
import uuid
from datetime import date, timedelta

# ── Environment (must be set before any app import) ─────────────────────────
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/hedgecalc_dev",
)
os.environ.setdefault("JWT_SECRET", "dev_secret_key_hedgecalc_2026")
os.environ.setdefault("ENV", "production")

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__)))
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("seed_presentation")

# ── Fixed UUIDs (must match seed.py) ────────────────────────────────────────
COMPANY_ID   = uuid.UUID("11111111-1111-1111-1111-111111111111")
BRANCH_HQ_ID = uuid.UUID("22222222-2222-2222-2222-222222222201")   # NYC HQ
BRANCH_MX_ID = uuid.UUID("22222222-2222-2222-2222-222222222202")   # Mexico City
BRANCH_LN_ID = uuid.UUID("22222222-2222-2222-2222-222222222203")   # London

# ── Presentation account ─────────────────────────────────────────────────────
PRESENTER_EMAIL = "s.williams@synexcapital.com"

# ── Deterministic seed for reproducibility ──────────────────────────────────
random.seed(42)


def future_date(days_from_now: int) -> str:
    return (date.today() + timedelta(days=days_from_now)).strftime("%Y-%m-%d")


def past_date(days_ago: int) -> str:
    return (date.today() - timedelta(days=days_ago)).strftime("%Y-%m-%d")


# ── Position definitions ──────────────────────────────────────────────────────
# 120 positions across 3 branches:
#   HQ (NYC):      50 positions — primary USD/MXN + USD/EUR book
#   Mexico City:   40 positions — MXN/USD heavy (AP = buy USD, AR = sell USD)
#   London:        30 positions — EUR/USD + GBP/USD cross
#
# All start execution_status=NEW (no policy assigned).
# Mix: 70% CONFIRMED, 30% FORECAST; 55% AP, 45% AR.

POSITIONS = [

    # ══════════════════════════════════════════════════════════════════════════
    # HEADQUARTERS — NEW YORK (50 positions)
    # Entities: Synex Capital, Synex Treasury LLC, FX Risk Desk
    # Currencies: MXN, EUR, BRL, JPY
    # ══════════════════════════════════════════════════════════════════════════

    # ── MXN AR block (USD receivables, hedging USD→MXN) ──────────────────────
    ("HQ-001", BRANCH_HQ_ID, "Synex Capital Partners",        "AR", "MXN", 4_850_000, future_date(30),  "CONFIRMED", "Q1 export receivable — Grupo Bimbo contract #2026-001"),
    ("HQ-002", BRANCH_HQ_ID, "Synex Capital Partners",        "AR", "MXN", 2_300_000, future_date(45),  "CONFIRMED", "Pemex services invoice — Jan 2026 delivery"),
    ("HQ-003", BRANCH_HQ_ID, "Synex Capital Partners",        "AR", "MXN", 7_100_000, future_date(60),  "CONFIRMED", "FEMSA distribution agreement — batch 3"),
    ("HQ-004", BRANCH_HQ_ID, "Synex Treasury LLC",            "AR", "MXN", 1_950_000, future_date(75),  "CONFIRMED", "Intercompany transfer from MXC branch"),
    ("HQ-005", BRANCH_HQ_ID, "Synex Capital Partners",        "AR", "MXN", 3_400_000, future_date(90),  "FORECAST",  "Forecast: Cemex Q2 receivable (unconfirmed)"),
    ("HQ-006", BRANCH_HQ_ID, "FX Risk Desk",                  "AR", "MXN", 5_750_000, future_date(120), "CONFIRMED", "América Móvil service contract — March 2026"),
    ("HQ-007", BRANCH_HQ_ID, "Synex Capital Partners",        "AR", "MXN", 2_100_000, future_date(150), "FORECAST",  "Forecast: Banorte advisory fees Q3"),
    ("HQ-008", BRANCH_HQ_ID, "Synex Treasury LLC",            "AR", "MXN", 8_900_000, future_date(180), "CONFIRMED", "BBVA Mexico custody settlement"),
    ("HQ-009", BRANCH_HQ_ID, "Synex Capital Partners",        "AR", "MXN", 1_250_000, future_date(30),  "CONFIRMED", "Soriana retail payment — Jan invoice"),
    ("HQ-010", BRANCH_HQ_ID, "FX Risk Desk",                  "AR", "MXN", 6_300_000, future_date(60),  "FORECAST",  "Forecast: Liverpool department store proceeds"),

    # ── MXN AP block (USD payables, hedging MXN→USD) ─────────────────────────
    ("HQ-011", BRANCH_HQ_ID, "Synex Capital Partners",        "AP", "MXN", 3_200_000, future_date(28),  "CONFIRMED", "Bloomberg terminal license — annual renewal"),
    ("HQ-012", BRANCH_HQ_ID, "Synex Capital Partners",        "AP", "MXN", 1_800_000, future_date(35),  "CONFIRMED", "AWS infrastructure — Q1 cloud services"),
    ("HQ-013", BRANCH_HQ_ID, "Synex Treasury LLC",            "AP", "MXN", 9_500_000, future_date(50),  "CONFIRMED", "JPMorgan custody fees — annual settlement"),
    ("HQ-014", BRANCH_HQ_ID, "FX Risk Desk",                  "AP", "MXN", 4_100_000, future_date(70),  "CONFIRMED", "Reuters Eikon data subscription"),
    ("HQ-015", BRANCH_HQ_ID, "Synex Capital Partners",        "AP", "MXN", 2_750_000, future_date(85),  "FORECAST",  "Forecast: NYC office rent hedge — Q2"),
    ("HQ-016", BRANCH_HQ_ID, "Synex Capital Partners",        "AP", "MXN", 6_600_000, future_date(100), "CONFIRMED", "Technology vendor payment — Murex SaaS"),
    ("HQ-017", BRANCH_HQ_ID, "Synex Treasury LLC",            "AP", "MXN", 1_450_000, future_date(120), "CONFIRMED", "Legal fees — Sullivan & Cromwell Q1"),
    ("HQ-018", BRANCH_HQ_ID, "FX Risk Desk",                  "AP", "MXN", 3_900_000, future_date(140), "FORECAST",  "Forecast: Capex — trading system upgrade"),
    ("HQ-019", BRANCH_HQ_ID, "Synex Capital Partners",        "AP", "MXN", 7_800_000, future_date(160), "CONFIRMED", "Prime brokerage margin — Citi Global Markets"),
    ("HQ-020", BRANCH_HQ_ID, "Synex Treasury LLC",            "AP", "MXN", 2_050_000, future_date(30),  "CONFIRMED", "Audit fees — KPMG 2025 annual"),

    # ── EUR block ─────────────────────────────────────────────────────────────
    ("HQ-021", BRANCH_HQ_ID, "Synex Capital Partners",        "AR", "EUR", 1_200_000, future_date(40),  "CONFIRMED", "ECB advisory mandate — EUR receivable"),
    ("HQ-022", BRANCH_HQ_ID, "Synex Capital Partners",        "AR", "EUR", 870_000,   future_date(65),  "CONFIRMED", "Deutsche Bank structured product proceeds"),
    ("HQ-023", BRANCH_HQ_ID, "FX Risk Desk",                  "AP", "EUR", 2_100_000, future_date(55),  "CONFIRMED", "Eurex clearing margins — Q1 settlement"),
    ("HQ-024", BRANCH_HQ_ID, "Synex Treasury LLC",            "AP", "EUR", 640_000,   future_date(80),  "FORECAST",  "Forecast: Frankfurt office — Q2 rent"),
    ("HQ-025", BRANCH_HQ_ID, "Synex Capital Partners",        "AR", "EUR", 3_500_000, future_date(90),  "CONFIRMED", "BNP Paribas repo facility maturity"),
    ("HQ-026", BRANCH_HQ_ID, "Synex Capital Partners",        "AR", "EUR", 950_000,   future_date(110), "CONFIRMED", "Allianz insurance premium return"),
    ("HQ-027", BRANCH_HQ_ID, "Synex Treasury LLC",            "AP", "EUR", 1_750_000, future_date(130), "CONFIRMED", "Euroclear settlement fees — annual"),
    ("HQ-028", BRANCH_HQ_ID, "FX Risk Desk",                  "AR", "EUR", 2_800_000, future_date(150), "FORECAST",  "Forecast: EIB green bond coupon"),
    ("HQ-029", BRANCH_HQ_ID, "Synex Capital Partners",        "AP", "EUR", 420_000,   future_date(170), "CONFIRMED", "Société Générale prime services fee"),
    ("HQ-030", BRANCH_HQ_ID, "Synex Capital Partners",        "AR", "EUR", 1_650_000, future_date(180), "CONFIRMED", "UniCredit structured notes maturity"),

    # ── BRL block ─────────────────────────────────────────────────────────────
    ("HQ-031", BRANCH_HQ_ID, "Synex Capital Partners",        "AR", "BRL", 12_400_000, future_date(35),  "CONFIRMED", "Petrobras export hedge receivable"),
    ("HQ-032", BRANCH_HQ_ID, "Synex Capital Partners",        "AR", "BRL", 8_700_000,  future_date(55),  "CONFIRMED", "Vale mining royalty proceeds"),
    ("HQ-033", BRANCH_HQ_ID, "Synex Treasury LLC",            "AP", "BRL", 5_300_000,  future_date(70),  "CONFIRMED", "Itaú Unibanco settlement — FX swap"),
    ("HQ-034", BRANCH_HQ_ID, "FX Risk Desk",                  "AP", "BRL", 3_900_000,  future_date(90),  "FORECAST",  "Forecast: Bradesco custody — Q2"),
    ("HQ-035", BRANCH_HQ_ID, "Synex Capital Partners",        "AR", "BRL", 18_200_000, future_date(105), "CONFIRMED", "Embraer aircraft finance receivable"),
    ("HQ-036", BRANCH_HQ_ID, "Synex Capital Partners",        "AP", "BRL", 7_600_000,  future_date(120), "CONFIRMED", "BTG Pactual advisory retainer"),
    ("HQ-037", BRANCH_HQ_ID, "Synex Treasury LLC",            "AR", "BRL", 4_100_000,  future_date(140), "FORECAST",  "Forecast: Suzano paper co. — bond coupon"),
    ("HQ-038", BRANCH_HQ_ID, "FX Risk Desk",                  "AP", "BRL", 6_800_000,  future_date(160), "CONFIRMED", "B3 exchange margin — futures book"),
    ("HQ-039", BRANCH_HQ_ID, "Synex Capital Partners",        "AR", "BRL", 9_900_000,  future_date(175), "CONFIRMED", "WEG industrial equipment receivable"),
    ("HQ-040", BRANCH_HQ_ID, "Synex Capital Partners",        "AP", "BRL", 2_300_000,  future_date(30),  "CONFIRMED", "Localfrio logistics — cold chain payable"),

    # ── Mixed short-dated (various currencies, stress testing) ───────────────
    ("HQ-041", BRANCH_HQ_ID, "FX Risk Desk",                  "AR", "MXN", 11_500_000, future_date(20),  "CONFIRMED", "Urgent: Banxico clearing — T+5 settlement"),
    ("HQ-042", BRANCH_HQ_ID, "Synex Capital Partners",        "AP", "EUR", 550_000,    future_date(18),  "CONFIRMED", "ECB margin call — emergency collateral"),
    ("HQ-043", BRANCH_HQ_ID, "Synex Treasury LLC",            "AR", "BRL", 14_000_000, future_date(22),  "CONFIRMED", "BRL spot: Banco do Brasil repatriation"),
    ("HQ-044", BRANCH_HQ_ID, "Synex Capital Partners",        "AP", "MXN", 4_400_000,  future_date(25),  "FORECAST",  "Forecast: Citi Mexico — credit line drawdown"),
    ("HQ-045", BRANCH_HQ_ID, "FX Risk Desk",                  "AR", "EUR", 720_000,    future_date(28),  "CONFIRMED", "Commerzbank T-bill proceeds"),
    ("HQ-046", BRANCH_HQ_ID, "Synex Capital Partners",        "AR", "MXN", 3_600_000,  future_date(32),  "CONFIRMED", "OHL infrastructure receivable — Phase 2"),
    ("HQ-047", BRANCH_HQ_ID, "Synex Treasury LLC",            "AP", "BRL", 8_100_000,  future_date(38),  "CONFIRMED", "Nucor Brazil — steel import payable"),
    ("HQ-048", BRANCH_HQ_ID, "Synex Capital Partners",        "AR", "MXN", 2_900_000,  future_date(42),  "FORECAST",  "Forecast: Telmex fiber contract — Q2 milestone"),
    ("HQ-049", BRANCH_HQ_ID, "FX Risk Desk",                  "AP", "EUR", 1_350_000,  future_date(48),  "CONFIRMED", "Deutsche Telekom invoice — network services"),
    ("HQ-050", BRANCH_HQ_ID, "Synex Capital Partners",        "AR", "BRL", 6_500_000,  future_date(52),  "CONFIRMED", "Multiplan shopping mall — rental income"),

    # ══════════════════════════════════════════════════════════════════════════
    # MEXICO CITY OFFICE (40 positions)
    # Entities: Synex Mexico SA, LATAM Trading Desk, Synex Derivatives MX
    # Currencies: MXN (primary), BRL (cross), EUR (cross)
    # ══════════════════════════════════════════════════════════════════════════

    # ── Core MXN book ─────────────────────────────────────────────────────────
    ("MX-001", BRANCH_MX_ID, "Synex Mexico SA",               "AP", "MXN", 6_200_000,  future_date(30),  "CONFIRMED", "Volkswagen Mexico — CKD components import"),
    ("MX-002", BRANCH_MX_ID, "Synex Mexico SA",               "AP", "MXN", 4_800_000,  future_date(45),  "CONFIRMED", "Samsung Electronics Mexico — Q1 device order"),
    ("MX-003", BRANCH_MX_ID, "LATAM Trading Desk",            "AR", "MXN", 9_100_000,  future_date(60),  "CONFIRMED", "Walmart de Mexico — distribution fee"),
    ("MX-004", BRANCH_MX_ID, "Synex Mexico SA",               "AR", "MXN", 3_700_000,  future_date(75),  "CONFIRMED", "Liverpool — seasonal inventory settlement"),
    ("MX-005", BRANCH_MX_ID, "Synex Derivatives MX",          "AP", "MXN", 7_350_000,  future_date(90),  "FORECAST",  "Forecast: Modelo Group — raw materials Q2"),
    ("MX-006", BRANCH_MX_ID, "Synex Mexico SA",               "AP", "MXN", 2_650_000,  future_date(105), "CONFIRMED", "Pemex petrochemicals — raw material payable"),
    ("MX-007", BRANCH_MX_ID, "LATAM Trading Desk",            "AR", "MXN", 5_500_000,  future_date(120), "CONFIRMED", "OXXO store network — franchise royalties"),
    ("MX-008", BRANCH_MX_ID, "Synex Derivatives MX",          "AP", "MXN", 3_100_000,  future_date(135), "FORECAST",  "Forecast: Bimbo LATAM — wheat import hedge"),
    ("MX-009", BRANCH_MX_ID, "Synex Mexico SA",               "AR", "MXN", 8_400_000,  future_date(150), "CONFIRMED", "Grupo Televisa — content licensing USD receipt"),
    ("MX-010", BRANCH_MX_ID, "LATAM Trading Desk",            "AP", "MXN", 4_200_000,  future_date(165), "CONFIRMED", "3M Mexico — industrial chemicals payable"),
    ("MX-011", BRANCH_MX_ID, "Synex Mexico SA",               "AR", "MXN", 6_900_000,  future_date(30),  "CONFIRMED", "Banregio intercompany loan maturity"),
    ("MX-012", BRANCH_MX_ID, "Synex Derivatives MX",          "AP", "MXN", 2_250_000,  future_date(40),  "CONFIRMED", "Nestlé Mexico — coffee procurement"),
    ("MX-013", BRANCH_MX_ID, "LATAM Trading Desk",            "AR", "MXN", 11_700_000, future_date(50),  "CONFIRMED", "CFE energy contract — generation revenue"),
    ("MX-014", BRANCH_MX_ID, "Synex Mexico SA",               "AP", "MXN", 3_800_000,  future_date(60),  "FORECAST",  "Forecast: LG Mexico electronics — H1"),
    ("MX-015", BRANCH_MX_ID, "Synex Derivatives MX",          "AR", "MXN", 7_100_000,  future_date(70),  "CONFIRMED", "Aeropuertos del Sureste — concession fee"),
    ("MX-016", BRANCH_MX_ID, "Synex Mexico SA",               "AP", "MXN", 5_400_000,  future_date(80),  "CONFIRMED", "Heineken Mexico — brewing equipment lease"),
    ("MX-017", BRANCH_MX_ID, "LATAM Trading Desk",            "AR", "MXN", 9_800_000,  future_date(90),  "CONFIRMED", "Soriana hypermarket — supply chain USD receipt"),
    ("MX-018", BRANCH_MX_ID, "Synex Derivatives MX",          "AP", "MXN", 1_900_000,  future_date(100), "FORECAST",  "Forecast: Honda Mexico — tooling import"),
    ("MX-019", BRANCH_MX_ID, "Synex Mexico SA",               "AR", "MXN", 4_600_000,  future_date(110), "CONFIRMED", "Alsea food services — franchise receivable"),
    ("MX-020", BRANCH_MX_ID, "LATAM Trading Desk",            "AP", "MXN", 6_700_000,  future_date(120), "CONFIRMED", "Cemex USA — cement raw material import"),

    # ── BRL cross-branch ─────────────────────────────────────────────────────
    ("MX-021", BRANCH_MX_ID, "Synex Mexico SA",               "AR", "BRL", 8_500_000,  future_date(35),  "CONFIRMED", "JBS Beef Brazil — cross-LATAM settlement"),
    ("MX-022", BRANCH_MX_ID, "LATAM Trading Desk",            "AP", "BRL", 5_200_000,  future_date(55),  "CONFIRMED", "Marfrig Foods — poultry import contract"),
    ("MX-023", BRANCH_MX_ID, "Synex Derivatives MX",          "AR", "BRL", 12_100_000, future_date(70),  "FORECAST",  "Forecast: Ambev beverages — regional deal"),
    ("MX-024", BRANCH_MX_ID, "Synex Mexico SA",               "AP", "BRL", 3_700_000,  future_date(85),  "CONFIRMED", "Gerdau steel — wire rod payable"),
    ("MX-025", BRANCH_MX_ID, "LATAM Trading Desk",            "AR", "BRL", 6_900_000,  future_date(100), "CONFIRMED", "LATAM Airlines cargo — route revenue"),

    # ── EUR cross ─────────────────────────────────────────────────────────────
    ("MX-026", BRANCH_MX_ID, "Synex Mexico SA",               "AP", "EUR", 980_000,    future_date(40),  "CONFIRMED", "Siemens Mexico — industrial automation"),
    ("MX-027", BRANCH_MX_ID, "LATAM Trading Desk",            "AR", "EUR", 1_350_000,  future_date(65),  "CONFIRMED", "Total Energies Mexico — gas contract"),
    ("MX-028", BRANCH_MX_ID, "Synex Derivatives MX",          "AP", "EUR", 740_000,    future_date(80),  "FORECAST",  "Forecast: Airbus MX — maintenance parts"),
    ("MX-029", BRANCH_MX_ID, "Synex Mexico SA",               "AR", "EUR", 2_100_000,  future_date(95),  "CONFIRMED", "Bayer Mexico — pharmaceutical license fee"),
    ("MX-030", BRANCH_MX_ID, "LATAM Trading Desk",            "AP", "EUR", 1_600_000,  future_date(115), "CONFIRMED", "Bosch Automotive — sensor components"),

    # ── Short-dated stress positions ─────────────────────────────────────────
    ("MX-031", BRANCH_MX_ID, "Synex Mexico SA",               "AP", "MXN", 14_500_000, future_date(15),  "CONFIRMED", "URGENT: FIX option expiry — Banxico ref"),
    ("MX-032", BRANCH_MX_ID, "LATAM Trading Desk",            "AR", "MXN", 7_800_000,  future_date(18),  "CONFIRMED", "Minutos México — quick settlement"),
    ("MX-033", BRANCH_MX_ID, "Synex Derivatives MX",          "AP", "MXN", 4_300_000,  future_date(22),  "FORECAST",  "Forecast: BBVA MX credit line drawdown"),
    ("MX-034", BRANCH_MX_ID, "Synex Mexico SA",               "AR", "BRL", 10_200_000, future_date(25),  "CONFIRMED", "Friboi meat processing — LATAM cross"),
    ("MX-035", BRANCH_MX_ID, "LATAM Trading Desk",            "AP", "MXN", 3_500_000,  future_date(28),  "CONFIRMED", "Kimberly-Clark MX — paper goods import"),
    ("MX-036", BRANCH_MX_ID, "Synex Derivatives MX",          "AR", "MXN", 5_100_000,  future_date(32),  "CONFIRMED", "Bajío railroad — cargo transport fee"),
    ("MX-037", BRANCH_MX_ID, "Synex Mexico SA",               "AP", "EUR", 820_000,    future_date(38),  "CONFIRMED", "ASML Holding — lithography equipment part"),
    ("MX-038", BRANCH_MX_ID, "LATAM Trading Desk",            "AR", "MXN", 9_300_000,  future_date(42),  "FORECAST",  "Forecast: ICA construction — Phase 3 milestone"),
    ("MX-039", BRANCH_MX_ID, "Synex Derivatives MX",          "AP", "MXN", 6_100_000,  future_date(46),  "CONFIRMED", "John Deere Mexico — tractor financing"),
    ("MX-040", BRANCH_MX_ID, "Synex Mexico SA",               "AR", "MXN", 4_700_000,  future_date(52),  "CONFIRMED", "Infraestructura Energética — gas pipeline fee"),

    # ══════════════════════════════════════════════════════════════════════════
    # LONDON OFFICE — EMEA (30 positions)
    # Entities: Synex EMEA Ltd, Synex FX Trading Ltd, EMEA Treasury
    # Currencies: EUR (primary), BRL (EM book), MXN (EM book)
    # ══════════════════════════════════════════════════════════════════════════

    # ── EUR core ──────────────────────────────────────────────────────────────
    ("LN-001", BRANCH_LN_ID, "Synex EMEA Ltd",                "AR", "EUR", 3_200_000,  future_date(30),  "CONFIRMED", "Volkswagen Group — DXC technology invoice"),
    ("LN-002", BRANCH_LN_ID, "Synex EMEA Ltd",                "AR", "EUR", 1_850_000,  future_date(45),  "CONFIRMED", "Airbus SE — component supply contract"),
    ("LN-003", BRANCH_LN_ID, "Synex FX Trading Ltd",          "AP", "EUR", 4_100_000,  future_date(60),  "CONFIRMED", "HSBC EMEA clearing — quarterly margin"),
    ("LN-004", BRANCH_LN_ID, "EMEA Treasury",                 "AP", "EUR", 2_700_000,  future_date(75),  "CONFIRMED", "Deutsche Bank prime — collateral call"),
    ("LN-005", BRANCH_LN_ID, "Synex EMEA Ltd",                "AR", "EUR", 5_600_000,  future_date(90),  "FORECAST",  "Forecast: Siemens Energy — service revenue Q2"),
    ("LN-006", BRANCH_LN_ID, "Synex FX Trading Ltd",          "AR", "EUR", 1_400_000,  future_date(105), "CONFIRMED", "LVMH — luxury goods distribution fee"),
    ("LN-007", BRANCH_LN_ID, "EMEA Treasury",                 "AP", "EUR", 3_850_000,  future_date(120), "CONFIRMED", "Euroclear — securities settlement"),
    ("LN-008", BRANCH_LN_ID, "Synex EMEA Ltd",                "AR", "EUR", 890_000,    future_date(135), "CONFIRMED", "Heineken EMEA — distribution royalty"),
    ("LN-009", BRANCH_LN_ID, "Synex FX Trading Ltd",          "AP", "EUR", 6_200_000,  future_date(150), "FORECAST",  "Forecast: ECB LTRO repayment — bond maturity"),
    ("LN-010", BRANCH_LN_ID, "EMEA Treasury",                 "AR", "EUR", 2_100_000,  future_date(165), "CONFIRMED", "Nordea — Scandinavian bond proceeds"),
    ("LN-011", BRANCH_LN_ID, "Synex EMEA Ltd",                "AP", "EUR", 1_750_000,  future_date(30),  "CONFIRMED", "BNP Paribas — fx hedging cost settlement"),
    ("LN-012", BRANCH_LN_ID, "Synex FX Trading Ltd",          "AR", "EUR", 4_300_000,  future_date(40),  "CONFIRMED", "Total Energies — North Sea contract"),
    ("LN-013", BRANCH_LN_ID, "EMEA Treasury",                 "AP", "EUR", 950_000,    future_date(50),  "CONFIRMED", "Barclays Capital — desk fee Q1"),
    ("LN-014", BRANCH_LN_ID, "Synex EMEA Ltd",                "AR", "EUR", 7_800_000,  future_date(60),  "CONFIRMED", "BP plc — LNG cargo proceeds"),
    ("LN-015", BRANCH_LN_ID, "Synex FX Trading Ltd",          "AP", "EUR", 2_400_000,  future_date(70),  "FORECAST",  "Forecast: Société Générale — structured note cost"),

    # ── BRL EM book ──────────────────────────────────────────────────────────
    ("LN-016", BRANCH_LN_ID, "Synex EMEA Ltd",                "AR", "BRL", 16_500_000, future_date(35),  "CONFIRMED", "Petrobras London bond coupon"),
    ("LN-017", BRANCH_LN_ID, "Synex FX Trading Ltd",          "AP", "BRL", 9_200_000,  future_date(55),  "CONFIRMED", "Bradesco ADR settlement — London EMEA"),
    ("LN-018", BRANCH_LN_ID, "EMEA Treasury",                 "AR", "BRL", 22_000_000, future_date(70),  "CONFIRMED", "Vale SA — GDR dividend repatriation"),
    ("LN-019", BRANCH_LN_ID, "Synex EMEA Ltd",                "AP", "BRL", 7_400_000,  future_date(90),  "FORECAST",  "Forecast: Embraer EMEA — aircraft delivery"),
    ("LN-020", BRANCH_LN_ID, "Synex FX Trading Ltd",          "AR", "BRL", 13_100_000, future_date(110), "CONFIRMED", "Eletrobras privatization proceeds"),

    # ── MXN EM book ──────────────────────────────────────────────────────────
    ("LN-021", BRANCH_LN_ID, "Synex EMEA Ltd",                "AR", "MXN", 8_700_000,  future_date(40),  "CONFIRMED", "Bancomext Eurobond coupon — London clearing"),
    ("LN-022", BRANCH_LN_ID, "EMEA Treasury",                 "AP", "MXN", 5_300_000,  future_date(60),  "CONFIRMED", "Mexico sovereign debt — Citi London"),
    ("LN-023", BRANCH_LN_ID, "Synex FX Trading Ltd",          "AR", "MXN", 11_400_000, future_date(80),  "FORECAST",  "Forecast: Telmex GDR — EMEA clearing"),
    ("LN-024", BRANCH_LN_ID, "Synex EMEA Ltd",                "AP", "MXN", 4_100_000,  future_date(100), "CONFIRMED", "HSBC Mexico — FX swap unwind"),
    ("LN-025", BRANCH_LN_ID, "EMEA Treasury",                 "AR", "MXN", 6_900_000,  future_date(120), "CONFIRMED", "América Móvil — London bond proceeds"),

    # ── Short-dated EMEA ─────────────────────────────────────────────────────
    ("LN-026", BRANCH_LN_ID, "Synex EMEA Ltd",                "AP", "EUR", 8_500_000,  future_date(14),  "CONFIRMED", "URGENT: LCH margin call — IRS book"),
    ("LN-027", BRANCH_LN_ID, "Synex FX Trading Ltd",          "AR", "EUR", 3_200_000,  future_date(17),  "CONFIRMED", "Rolls-Royce — engine maintenance contract"),
    ("LN-028", BRANCH_LN_ID, "EMEA Treasury",                 "AP", "BRL", 11_800_000, future_date(20),  "CONFIRMED", "Itaú BBA London — repo expiry"),
    ("LN-029", BRANCH_LN_ID, "Synex EMEA Ltd",                "AR", "EUR", 1_900_000,  future_date(25),  "FORECAST",  "Forecast: Unilever EMEA — royalty advance"),
    ("LN-030", BRANCH_LN_ID, "Synex FX Trading Ltd",          "AP", "EUR", 4_600_000,  future_date(28),  "CONFIRMED", "Credit Suisse wind-down — legacy book"),
]


async def seed_positions():
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

    db_url = os.environ["DATABASE_URL"]
    engine = create_async_engine(db_url, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    log.info("=" * 70)
    log.info("  PRESENTATION SEED — Synex Capital Partners")
    log.info("  120 FX positions across HQ / Mexico City / London")
    log.info("=" * 70)

    async with Session() as session:
        # -- Find the presenter user (s.williams) ----------------------------
        from app.models.user import User
        from app.models.position import Position

        r = await session.execute(
            select(User).where(User.email == PRESENTER_EMAIL)
        )
        presenter = r.scalars().first()
        if not presenter:
            log.error(f"\n  ERROR: User '{PRESENTER_EMAIL}' not found.")
            log.error("  Run seed_company.py (or POST /api/v1/seed/company) first.\n")
            return

        log.info(f"\n  Presenter: {presenter.full_name} ({presenter.email})")
        log.info(f"  Company:   {presenter.company_id}")
        log.info(f"  Branch:    {presenter.branch_id}")

        # -- Count existing positions ----------------------------------------
        existing_r = await session.execute(
            select(Position).where(
                Position.company_id == COMPANY_ID,
                Position.is_active == True,
            )
        )
        existing = list(existing_r.scalars().all())
        existing_record_ids = {p.record_id for p in existing}

        log.info(f"\n  Existing positions in DB: {len(existing)}")

        inserted = 0
        skipped  = 0

        for (
            record_id, branch_id, entity,
            flow_type, currency, amount,
            value_date, status, description
        ) in POSITIONS:

            if record_id in existing_record_ids:
                skipped += 1
                continue

            pos = Position(
                company_id=COMPANY_ID,
                branch_id=branch_id,
                created_by=presenter.id,
                record_id=record_id,
                entity=entity,
                flow_type=flow_type,
                currency=currency,
                amount=amount,
                value_date=value_date,
                status=status,
                description=description,
                execution_status="NEW",
                is_active=True,
            )
            session.add(pos)
            inserted += 1

        await session.commit()

        log.info(f"\n  Inserted: {inserted} new positions")
        log.info(f"  Skipped:  {skipped} (already exist)")
        log.info(f"  Total:    {inserted + len(existing)} positions in DB")

    # -- Summary by branch ---------------------------------------------------
    async with Session() as session:
        from app.models.position import Position
        from sqlalchemy import func

        for branch_id, branch_name in [
            (BRANCH_HQ_ID, "HQ New York"),
            (BRANCH_MX_ID, "Mexico City"),
            (BRANCH_LN_ID, "London"),
        ]:
            r = await session.execute(
                select(func.count(Position.id)).where(
                    Position.company_id == COMPANY_ID,
                    Position.branch_id == branch_id,
                    Position.is_active == True,
                )
            )
            count = r.scalar_one()
            log.info(f"    {branch_name:<20} {count:>3} positions")

        # Exposure by currency
        log.info("\n  Exposure by currency (total notional):")
        for currency in ["MXN", "BRL", "EUR"]:
            r = await session.execute(
                select(func.sum(Position.amount)).where(
                    Position.company_id == COMPANY_ID,
                    Position.currency == currency,
                    Position.is_active == True,
                )
            )
            total = r.scalar_one() or 0
            log.info(f"    {currency}  {total:>20,.0f}")

    await engine.dispose()

    log.info("\n" + "=" * 70)
    log.info("  DONE — Presentation data ready.")
    log.info("")
    log.info("  Login as:  s.williams@synexcapital.com")
    log.info("  Password:  SWill@2026!")
    log.info("")
    log.info("  Next steps for live demo:")
    log.info("  1. Login → Dashboard shows 120 NEW positions, 0% coverage")
    log.info("  2. Go to Policy Library → activate a policy (e.g. BLNC)")
    log.info("  3. Go to Position Desk → assign policy to positions")
    log.info("  4. Run calculations → see hedge proposals")
    log.info("  5. Approve in pipeline → ledger entry created")
    log.info("  6. Reports show full P&L and coverage breakdown")
    log.info("=" * 70 + "\n")


if __name__ == "__main__":
    if sys.platform.startswith("win"):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    # Allow DATABASE_URL override from command line
    if len(sys.argv) > 1:
        os.environ["DATABASE_URL"] = sys.argv[1]
        log.info(f"Using DATABASE_URL from arg: {sys.argv[1][:40]}...")

    asyncio.run(seed_positions())
