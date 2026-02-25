# app/api/routes/seed.py

"""

One-time seed endpoint to populate the demo company with full hierarchy,

roles, and sample employees. Protected by API key.



POST /api/v1/seed/company

"""



from __future__ import annotations



import logging

import uuid

from typing import List



from fastapi import APIRouter, Depends, HTTPException, Header

from sqlalchemy import select, text

from sqlalchemy.ext.asyncio import AsyncSession



from app.core.db import get_session

from app.core.config import settings

from app.core.security import hash_password

from app.models.user import User

from app.models.rbac import Role, UserRole

from app.models.organization import Company, Branch, Department

from app.models.permission import Permission, RolePermission, SEED_PERMISSIONS

from app.models.policy import PolicyTemplate



logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/seed", tags=["seed"])



# ?? Policy preset seed data (mirrors frontend policyPresets.ts) ???????????????

# Policy preset seed data -- mirrors frontend policyPresets.ts (60 system templates)
_POLICY_PRESETS_SEED = [
    # CORPORATE
    {'name': 'Small Business / Startup', 'short_name': 'SME', 'description': 'No minimum trade size - every bucket executes regardless of notional. Built for SMEs, startups, and early-stage hedgers with smaller transaction volumes.', 'risk_posture': 'MODERATE', 'category': 'CORPORATE', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.8, 'forecast': 0.5}, 'cost_assumptions': {'spread_bps': 25.0}, 'execution_product': 'NDF', 'min_trade_size_usd': 0.0}},
    {'name': 'Full Protection', 'short_name': 'FULL', 'description': 'Maximum hedge coverage for all confirmed and forecast flows. Zero FX tolerance.', 'risk_posture': 'CONSERVATIVE', 'category': 'CORPORATE', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 1.0, 'forecast': 1.0}, 'cost_assumptions': {'spread_bps': 4.0}, 'execution_product': 'FWD', 'min_trade_size_usd': 50000.0}},
    {'name': 'Conservative Treasury', 'short_name': 'CNSV', 'description': 'Full confirmed coverage, minimal forecast hedging. Board-mandated treasury policy.', 'risk_posture': 'CONSERVATIVE', 'category': 'CORPORATE', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 1.0, 'forecast': 0.25}, 'cost_assumptions': {'spread_bps': 3.0}, 'execution_product': 'FWD', 'min_trade_size_usd': 100000.0}},
    {'name': 'Balanced Corporate', 'short_name': 'BLNC', 'description': 'Full confirmed coverage, moderate forecast hedging. Standard mid-market FX program.', 'risk_posture': 'MODERATE', 'category': 'CORPORATE', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 1.0, 'forecast': 0.5}, 'cost_assumptions': {'spread_bps': 5.0}, 'execution_product': 'NDF', 'min_trade_size_usd': 50000.0}},
    {'name': 'Active Risk Management', 'short_name': 'ACTV', 'description': 'High coverage across confirmed and forecast flows. Active FX risk mandate with tactical overlay.', 'risk_posture': 'AGGRESSIVE', 'category': 'CORPORATE', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 1.0, 'forecast': 0.75}, 'cost_assumptions': {'spread_bps': 4.0}, 'execution_product': 'NDF', 'min_trade_size_usd': 25000.0}},
    {'name': 'Cost-Sensitive Hedger', 'short_name': 'COST', 'description': 'Confirmed-only coverage. Hedges firm commitments only - avoids forecast hedging cost.', 'risk_posture': 'CONSERVATIVE', 'category': 'CORPORATE', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.8, 'forecast': 0.0}, 'cost_assumptions': {'spread_bps': 8.0}, 'execution_product': 'NDF', 'min_trade_size_usd': 75000.0}},
    {'name': 'Layered Rolling', 'short_name': 'LAYR', 'description': 'Graduated hedge build-up over 12 months. Avoids locking full exposure at a single spot rate.', 'risk_posture': 'MODERATE', 'category': 'CORPORATE', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 1.0, 'forecast': 0.6}, 'cost_assumptions': {'spread_bps': 4.5}, 'execution_product': 'FWD', 'min_trade_size_usd': 50000.0}},
    {'name': 'NGO / Non-Profit', 'short_name': 'NGO', 'description': 'Grant and donation FX protection. Full coverage of incoming USD grants to preserve programme budgets.', 'risk_posture': 'CONSERVATIVE', 'category': 'CORPORATE', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.95, 'forecast': 0.8}, 'cost_assumptions': {'spread_bps': 10.0}, 'execution_product': 'FWD', 'min_trade_size_usd': 0.0}},
    {'name': 'Import / Export Trader', 'short_name': 'IMEX', 'description': 'Transactional hedge for active importers/exporters with high PO frequency and short tenors.', 'risk_posture': 'MODERATE', 'category': 'CORPORATE', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.9, 'forecast': 0.6}, 'cost_assumptions': {'spread_bps': 5.5}, 'execution_product': 'NDF', 'min_trade_size_usd': 10000.0}},
    {'name': 'Education / Institutions', 'short_name': 'EDUC', 'description': 'Tuition revenue and USD equipment purchase hedge for universities and educational institutions.', 'risk_posture': 'CONSERVATIVE', 'category': 'CORPORATE', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 1.0, 'forecast': 0.5}, 'cost_assumptions': {'spread_bps': 8.0}, 'execution_product': 'FWD', 'min_trade_size_usd': 5000.0}},
    # FINANCIAL
    {'name': 'Bank Trading Book', 'short_name': 'BANK', 'description': 'Tight spread, high minimum, NDF-only. Mirrors interbank desk execution parameters.', 'risk_posture': 'AGGRESSIVE', 'category': 'FINANCIAL', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 1.0, 'forecast': 0.9}, 'cost_assumptions': {'spread_bps': 2.0}, 'execution_product': 'NDF', 'min_trade_size_usd': 500000.0}},
    {'name': 'Asset Manager', 'short_name': 'AMGR', 'description': 'Benchmark-relative hedging. Partial confirmed hedge, minimal forecast. Tracks mandate benchmark.', 'risk_posture': 'MODERATE', 'category': 'FINANCIAL', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.75, 'forecast': 0.0}, 'cost_assumptions': {'spread_bps': 3.5}, 'execution_product': 'FWD', 'min_trade_size_usd': 250000.0}},
    {'name': 'Private Equity', 'short_name': 'PE', 'description': 'Exit-date hedging. Protects terminal valuation and IRR, not operating flows.', 'risk_posture': 'CONSERVATIVE', 'category': 'FINANCIAL', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 1.0, 'forecast': 0.1}, 'cost_assumptions': {'spread_bps': 6.0}, 'execution_product': 'FWD', 'min_trade_size_usd': 1000000.0}},
    {'name': 'Insurance Reserves', 'short_name': 'INSR', 'description': 'Liability-matching hedge. Matches reserve currency to claims currency. Solvency II aligned.', 'risk_posture': 'CONSERVATIVE', 'category': 'FINANCIAL', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 1.0, 'forecast': 0.15}, 'cost_assumptions': {'spread_bps': 4.0}, 'execution_product': 'FWD', 'min_trade_size_usd': 500000.0}},
    {'name': 'Family Office', 'short_name': 'FAML', 'description': 'Wealth preservation hedge for family offices with cross-border portfolio and real asset exposure.', 'risk_posture': 'MODERATE', 'category': 'FINANCIAL', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.85, 'forecast': 0.2}, 'cost_assumptions': {'spread_bps': 5.5}, 'execution_product': 'FWD', 'min_trade_size_usd': 250000.0}},
    {'name': 'Hedge Fund', 'short_name': 'HFND', 'description': 'Alpha-focused FX programme. Near-full coverage with tight spreads for systematic trading desks.', 'risk_posture': 'AGGRESSIVE', 'category': 'FINANCIAL', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 1.0, 'forecast': 0.95}, 'cost_assumptions': {'spread_bps': 1.5}, 'execution_product': 'NDF', 'min_trade_size_usd': 1000000.0}},
    {'name': 'VC / Growth Equity', 'short_name': 'VCGR', 'description': 'Portfolio company FX protection. Selective hedging of USD capital calls and exit proceeds.', 'risk_posture': 'MODERATE', 'category': 'FINANCIAL', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.7, 'forecast': 0.1}, 'cost_assumptions': {'spread_bps': 7.0}, 'execution_product': 'FWD', 'min_trade_size_usd': 500000.0}},
    {'name': 'FX Prime Broker Overlay', 'short_name': 'FXPB', 'description': 'Residual FX exposure hedge for prime brokerage operations. Covers tail FX risk after client-level netting.', 'risk_posture': 'AGGRESSIVE', 'category': 'FINANCIAL', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 1.0, 'forecast': 0.99}, 'cost_assumptions': {'spread_bps': 1.0}, 'execution_product': 'NDF', 'min_trade_size_usd': 10000000.0}},
    {'name': 'Pension Fund - LDI FX Hedge', 'short_name': 'PNSN', 'description': 'Liability-driven FX hedge for defined benefit pension funds with overseas asset allocations.', 'risk_posture': 'CONSERVATIVE', 'category': 'FINANCIAL', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 1.0, 'forecast': 0.5}, 'cost_assumptions': {'spread_bps': 2.0}, 'execution_product': 'FWD', 'min_trade_size_usd': 5000000.0}},
    {'name': 'University Endowment', 'short_name': 'UNIV', 'description': 'Return-preservation FX hedge for university endowments with diverse foreign asset allocations.', 'risk_posture': 'MODERATE', 'category': 'FINANCIAL', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.5, 'forecast': 0.25}, 'cost_assumptions': {'spread_bps': 3.0}, 'execution_product': 'FWD', 'min_trade_size_usd': 1000000.0}},
    {'name': 'REIT - Cross-Border Property', 'short_name': 'REITX', 'description': 'NOI and capital event FX hedge for REITs with international property portfolios.', 'risk_posture': 'CONSERVATIVE', 'category': 'FINANCIAL', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.8, 'forecast': 0.5}, 'cost_assumptions': {'spread_bps': 4.0}, 'execution_product': 'FWD', 'min_trade_size_usd': 500000.0}},
    {'name': 'SPV / Structured Finance Vehicle', 'short_name': 'SPVX', 'description': 'Cash waterfall protection hedge for SPVs and securitization vehicles with cross-currency asset and liability stacks.', 'risk_posture': 'CONSERVATIVE', 'category': 'FINANCIAL', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 1.0, 'forecast': 0.05}, 'cost_assumptions': {'spread_bps': 3.5}, 'execution_product': 'FWD', 'min_trade_size_usd': 5000000.0}},
    # SOVEREIGN
    {'name': 'Sovereign Debt Service', 'short_name': 'SOVR', 'description': 'Full USD debt service hedging. Protects sovereign budget from FX-driven debt cost spikes.', 'risk_posture': 'CONSERVATIVE', 'category': 'SOVEREIGN', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 1.0, 'forecast': 0.0}, 'cost_assumptions': {'spread_bps': 2.5}, 'execution_product': 'FWD', 'min_trade_size_usd': 5000000.0}},
    {'name': 'Export Proceeds', 'short_name': 'XPRT', 'description': 'Commodity export receipts hedging. Locks USD revenue against local currency depreciation.', 'risk_posture': 'MODERATE', 'category': 'SOVEREIGN', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.9, 'forecast': 0.6}, 'cost_assumptions': {'spread_bps': 3.0}, 'execution_product': 'NDF', 'min_trade_size_usd': 2000000.0}},
    {'name': 'Central Bank FX Ops', 'short_name': 'CBNK', 'description': 'Reserve management overlay. Minimal hedging - intervention-ready liquidity maintained.', 'risk_posture': 'AGGRESSIVE', 'category': 'SOVEREIGN', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.1, 'forecast': 0.0}, 'cost_assumptions': {'spread_bps': 1.5}, 'execution_product': 'NDF', 'min_trade_size_usd': 10000000.0}},
    {'name': 'Development Bank Project Loan', 'short_name': 'DEVB', 'description': 'USD/EUR disbursement and local currency repayment hedge for multilateral development banks.', 'risk_posture': 'CONSERVATIVE', 'category': 'SOVEREIGN', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 1.0, 'forecast': 0.2}, 'cost_assumptions': {'spread_bps': 2.0}, 'execution_product': 'FWD', 'min_trade_size_usd': 10000000.0}},
    {'name': 'Sovereign Wealth Fund (SWF)', 'short_name': 'SWFD', 'description': 'Strategic FX overlay for sovereign wealth funds with foreign asset allocations.', 'risk_posture': 'MODERATE', 'category': 'SOVEREIGN', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.5, 'forecast': 0.3}, 'cost_assumptions': {'spread_bps': 1.5}, 'execution_product': 'FWD', 'min_trade_size_usd': 50000000.0}},
    {'name': 'Municipal Government Debt Service', 'short_name': 'MUNI', 'description': 'USD-denominated bond coupon and principal hedge for municipal governments with foreign currency debt.', 'risk_posture': 'CONSERVATIVE', 'category': 'SOVEREIGN', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 1.0, 'forecast': 0.0}, 'cost_assumptions': {'spread_bps': 2.5}, 'execution_product': 'FWD', 'min_trade_size_usd': 2000000.0}},
    # SECTOR
    {'name': 'Airline / Aviation', 'short_name': 'AIRL', 'description': 'Jet fuel cost and USD revenue hedge. Covers fuel payables and USD-denominated ticket revenue.', 'risk_posture': 'MODERATE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.9, 'forecast': 0.7}, 'cost_assumptions': {'spread_bps': 5.5}, 'execution_product': 'NDF', 'min_trade_size_usd': 100000.0}},
    {'name': 'Technology / SaaS', 'short_name': 'TECH', 'description': 'USD revenue, MXN cost base. Light hedge on USD receivables - preserves natural hedge benefit.', 'risk_posture': 'MODERATE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.5, 'forecast': 0.3}, 'cost_assumptions': {'spread_bps': 5.0}, 'execution_product': 'NDF', 'min_trade_size_usd': 5000.0}},
    {'name': 'Real Estate / REIB', 'short_name': 'REIT', 'description': 'USD construction cost hedge by project phase. Protects import material payables.', 'risk_posture': 'CONSERVATIVE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 1.0, 'forecast': 0.2}, 'cost_assumptions': {'spread_bps': 6.0}, 'execution_product': 'FWD', 'min_trade_size_usd': 200000.0}},
    {'name': 'Pharma / Healthcare', 'short_name': 'PHRM', 'description': 'API and equipment USD import hedging. Regulatory margin protection for essential medicines.', 'risk_posture': 'CONSERVATIVE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 1.0, 'forecast': 0.4}, 'cost_assumptions': {'spread_bps': 4.0}, 'execution_product': 'FWD', 'min_trade_size_usd': 10000.0}},
    {'name': 'Agriculture / Commodity', 'short_name': 'AGRI', 'description': 'Harvest-season USD receipt hedging. Locks exchange rate at planting for harvest proceeds.', 'risk_posture': 'MODERATE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.85, 'forecast': 0.7}, 'cost_assumptions': {'spread_bps': 5.5}, 'execution_product': 'NDF', 'min_trade_size_usd': 10000.0}},
    {'name': 'Automotive Supply Chain', 'short_name': 'AUTO', 'description': 'Tier-1/2 supplier policy. Full USD component cost hedge with receivable netting.', 'risk_posture': 'AGGRESSIVE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 1.0, 'forecast': 0.8}, 'cost_assumptions': {'spread_bps': 3.5}, 'execution_product': 'NDF', 'min_trade_size_usd': 5000.0}},
    {'name': 'Retail Importer', 'short_name': 'RETL', 'description': 'Seasonal inventory hedge. Locks USD purchase cost for holiday season buying windows.', 'risk_posture': 'MODERATE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.9, 'forecast': 0.4}, 'cost_assumptions': {'spread_bps': 6.5}, 'execution_product': 'NDF', 'min_trade_size_usd': 5000.0}},
    {'name': 'Hospitality / Tourism', 'short_name': 'HSPT', 'description': 'Seasonal FX hedging for hotel groups and tour operators with USD-denominated bookings and supplier contracts.', 'risk_posture': 'MODERATE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.7, 'forecast': 0.4}, 'cost_assumptions': {'spread_bps': 7.0}, 'execution_product': 'NDF', 'min_trade_size_usd': 10000.0}},
    {'name': 'Shipping / Logistics', 'short_name': 'SHIP', 'description': 'Freight cost and USD charter rate hedging for logistics operators and shipping companies.', 'risk_posture': 'MODERATE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.85, 'forecast': 0.65}, 'cost_assumptions': {'spread_bps': 4.5}, 'execution_product': 'NDF', 'min_trade_size_usd': 25000.0}},
    {'name': 'Mining / Natural Resources', 'short_name': 'MINE', 'description': 'USD commodity revenue hedging for mining companies and natural resource exporters.', 'risk_posture': 'MODERATE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.8, 'forecast': 0.55}, 'cost_assumptions': {'spread_bps': 5.0}, 'execution_product': 'NDF', 'min_trade_size_usd': 100000.0}},
    {'name': 'Construction / Infrastructure', 'short_name': 'BLDG', 'description': 'Project-based USD material cost hedge. Full confirmed coverage; minimal forecast during tender phase.', 'risk_posture': 'CONSERVATIVE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 1.0, 'forecast': 0.3}, 'cost_assumptions': {'spread_bps': 6.5}, 'execution_product': 'FWD', 'min_trade_size_usd': 50000.0}},
    {'name': 'Media / Entertainment', 'short_name': 'MDIA', 'description': 'USD content licensing and production cost hedge for media companies, studios, and streaming platforms.', 'risk_posture': 'MODERATE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.6, 'forecast': 0.35}, 'cost_assumptions': {'spread_bps': 6.0}, 'execution_product': 'NDF', 'min_trade_size_usd': 5000.0}},
    {'name': 'Energy / Utilities', 'short_name': 'ENGY', 'description': 'USD fuel and equipment import hedging for energy companies and regulated utilities.', 'risk_posture': 'CONSERVATIVE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.95, 'forecast': 0.7}, 'cost_assumptions': {'spread_bps': 3.5}, 'execution_product': 'FWD', 'min_trade_size_usd': 500000.0}},
    {'name': 'Oil & Gas Upstream (E&P)', 'short_name': 'OILG', 'description': 'USD production revenue hedge for E&P companies. Protects netback price from FX-driven local currency appreciation.', 'risk_posture': 'MODERATE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.8, 'forecast': 0.65}, 'cost_assumptions': {'spread_bps': 4.0}, 'execution_product': 'NDF', 'min_trade_size_usd': 500000.0}},
    {'name': 'LNG Export Operations', 'short_name': 'LNGX', 'description': 'Long-tenor USD offtake agreement hedge for LNG exporters. Matches hedge maturities to 5-20 year supply contracts.', 'risk_posture': 'CONSERVATIVE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 1.0, 'forecast': 0.4}, 'cost_assumptions': {'spread_bps': 3.0}, 'execution_product': 'FWD', 'min_trade_size_usd': 5000000.0}},
    {'name': 'Renewable Energy / PPA', 'short_name': 'RENW', 'description': 'USD PPA revenue hedge for renewable energy projects with local currency construction and O&M costs.', 'risk_posture': 'CONSERVATIVE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.9, 'forecast': 0.6}, 'cost_assumptions': {'spread_bps': 4.5}, 'execution_product': 'FWD', 'min_trade_size_usd': 1000000.0}},
    {'name': 'Oil Field Services (OFS)', 'short_name': 'OFSC', 'description': 'USD day-rate revenue and local cost hedge for oilfield services companies with multi-jurisdiction operations.', 'risk_posture': 'MODERATE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.75, 'forecast': 0.5}, 'cost_assumptions': {'spread_bps': 5.0}, 'execution_product': 'NDF', 'min_trade_size_usd': 250000.0}},
    {'name': 'Clinical Research Organization (CRO)', 'short_name': 'CROO', 'description': 'Multi-currency clinical trial cost hedge for CROs managing global Phase II-IV studies.', 'risk_posture': 'MODERATE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.85, 'forecast': 0.45}, 'cost_assumptions': {'spread_bps': 6.0}, 'execution_product': 'NDF', 'min_trade_size_usd': 25000.0}},
    {'name': 'Medical Device OEM', 'short_name': 'MDEV', 'description': 'USD component import and EUR/JPY equipment cost hedge for medical device manufacturers.', 'risk_posture': 'CONSERVATIVE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 1.0, 'forecast': 0.7}, 'cost_assumptions': {'spread_bps': 4.5}, 'execution_product': 'FWD', 'min_trade_size_usd': 10000.0}},
    {'name': 'Hospital Group Treasury', 'short_name': 'HOSP', 'description': 'USD medical equipment import and insurance receivable hedge for hospital groups.', 'risk_posture': 'CONSERVATIVE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 1.0, 'forecast': 0.6}, 'cost_assumptions': {'spread_bps': 5.5}, 'execution_product': 'FWD', 'min_trade_size_usd': 50000.0}},
    {'name': 'Semiconductor Supply Chain', 'short_name': 'SEMI', 'description': 'Multi-currency wafer procurement and chip sales hedge for semiconductor companies.', 'risk_posture': 'MODERATE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.9, 'forecast': 0.65}, 'cost_assumptions': {'spread_bps': 3.5}, 'execution_product': 'NDF', 'min_trade_size_usd': 100000.0}},
    {'name': 'Enterprise SaaS / Cloud Revenue', 'short_name': 'CLUD', 'description': 'Large-scale USD ARR hedge for cloud software companies with global multi-currency revenue.', 'risk_posture': 'MODERATE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.6, 'forecast': 0.4}, 'cost_assumptions': {'spread_bps': 2.5}, 'execution_product': 'FWD', 'min_trade_size_usd': 500000.0}},
    {'name': 'Hardware OEM Importer', 'short_name': 'HDWR', 'description': 'USD hardware component import hedge for consumer electronics and IT hardware companies.', 'risk_posture': 'MODERATE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.9, 'forecast': 0.5}, 'cost_assumptions': {'spread_bps': 5.0}, 'execution_product': 'NDF', 'min_trade_size_usd': 25000.0}},
    {'name': 'Coffee Exporter', 'short_name': 'COFF', 'description': 'USD export receipt hedge for green coffee exporters. Locks USD/local-currency conversion rate at forward contract.', 'risk_posture': 'MODERATE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.85, 'forecast': 0.75}, 'cost_assumptions': {'spread_bps': 7.0}, 'execution_product': 'NDF', 'min_trade_size_usd': 10000.0}},
    {'name': 'Cocoa / Chocolate Supply Chain', 'short_name': 'COCO', 'description': 'USD cocoa procurement and chocolate export hedge for confectionery companies and cocoa traders.', 'risk_posture': 'MODERATE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.7, 'forecast': 0.5}, 'cost_assumptions': {'spread_bps': 6.5}, 'execution_product': 'NDF', 'min_trade_size_usd': 25000.0}},
    {'name': 'Grain / Oilseed Trader', 'short_name': 'GRNT', 'description': 'Back-to-back USD grain procurement and export sale FX hedge. Locks the FX spread on physical grain trading books.', 'risk_posture': 'AGGRESSIVE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 1.0, 'forecast': 0.8}, 'cost_assumptions': {'spread_bps': 3.0}, 'execution_product': 'NDF', 'min_trade_size_usd': 100000.0}},
    {'name': 'Livestock / Meat Packing Export', 'short_name': 'MEAT', 'description': 'USD beef and poultry export receipt hedge for meat packers and protein exporters.', 'risk_posture': 'MODERATE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.8, 'forecast': 0.6}, 'cost_assumptions': {'spread_bps': 6.0}, 'execution_product': 'NDF', 'min_trade_size_usd': 50000.0}},
    {'name': 'Brazil BRL Corporate Hedger', 'short_name': 'BRLC', 'description': 'BRL-specialized corporate hedge policy for USD/BRL exposure. Calibrated to BRL structural volatility and NDF-only settlement.', 'risk_posture': 'MODERATE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.8, 'forecast': 0.55}, 'cost_assumptions': {'spread_bps': 8.0}, 'execution_product': 'NDF', 'min_trade_size_usd': 50000.0}},
    {'name': 'Mexico MXN Nearshore (Maquiladora)', 'short_name': 'MXNN', 'description': 'MXN-optimized policy for nearshore manufacturing and maquiladora operations.', 'risk_posture': 'MODERATE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 1.0, 'forecast': 0.7}, 'cost_assumptions': {'spread_bps': 5.0}, 'execution_product': 'NDF', 'min_trade_size_usd': 25000.0}},
    {'name': 'Turkey TRY High-Carry Hedger', 'short_name': 'TRYC', 'description': 'TRY-specialized hedge policy for USD/TRY exposure. Calibrated to extreme carry costs and high vol environment.', 'risk_posture': 'CONSERVATIVE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.85, 'forecast': 0.25}, 'cost_assumptions': {'spread_bps': 15.0}, 'execution_product': 'NDF', 'min_trade_size_usd': 100000.0}},
    {'name': 'South Africa ZAR Resources Exporter', 'short_name': 'ZARR', 'description': 'ZAR-optimized policy for South African mining and resources exporters.', 'risk_posture': 'MODERATE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.75, 'forecast': 0.55}, 'cost_assumptions': {'spread_bps': 6.5}, 'execution_product': 'NDF', 'min_trade_size_usd': 100000.0}},
    {'name': 'India INR Technology & IT Services', 'short_name': 'INRT', 'description': 'INR-optimized hedge policy for Indian IT services and technology exporters.', 'risk_posture': 'MODERATE', 'category': 'SECTOR', 'config': {'bucket_mode': 'CALENDAR_MONTH', 'hedge_ratios': {'confirmed': 0.65, 'forecast': 0.4}, 'cost_assumptions': {'spread_bps': 5.5}, 'execution_product': 'NDF', 'min_trade_size_usd': 25000.0}},
]





async def _seed_policy_templates(db: AsyncSession) -> int:

    """

    Idempotently insert all system policy presets.

    Checks by (short_name, is_system=True, company_id IS NULL).

    Deduplicates any existing duplicate rows first.

    Returns the number of new templates inserted.

    """

    # Dedup: keep only the row with min(id) per short_name for system templates

    from sqlalchemy import text

    try:

        await db.execute(text(

            "DELETE FROM policy_templates WHERE is_system = TRUE AND company_id IS NULL AND id NOT IN ("

            "    SELECT MIN(id::text)::uuid FROM policy_templates WHERE is_system = TRUE AND company_id IS NULL GROUP BY short_name"

            ")"

        ))

        await db.flush()

    except Exception as e:

        logger.warning(f"Policy template dedup failed (non-fatal): {e}")

    inserted = 0

    for preset in _POLICY_PRESETS_SEED:

        r = await db.execute(

            select(PolicyTemplate).where(

                PolicyTemplate.short_name == preset["short_name"],

                PolicyTemplate.is_system.is_(True),

                PolicyTemplate.company_id.is_(None),

            )

        )

        if r.scalars().first():

            continue  # already exists -- idempotent

        db.add(PolicyTemplate(

            name=preset["name"],

            short_name=preset["short_name"],

            description=preset["description"],

            risk_posture=preset["risk_posture"],

            category=preset["category"],

            config=preset["config"],

            is_system=True,

            company_id=None,

            version=1,

        ))

        inserted += 1

    await db.flush()

    logger.info(f"Policy template seed: {inserted} new templates inserted ({len(_POLICY_PRESETS_SEED)} total defined)")

    return inserted



# ?? Fixed UUIDs ??????????????????????????????????????????????????????????????

COMPANY_ID   = uuid.UUID("11111111-1111-1111-1111-111111111111")

BRANCH_HQ_ID = uuid.UUID("22222222-2222-2222-2222-222222222201")

BRANCH_MX_ID = uuid.UUID("22222222-2222-2222-2222-222222222202")

BRANCH_LN_ID = uuid.UUID("22222222-2222-2222-2222-222222222203")

DEPT_FX_HQ   = uuid.UUID("33333333-3333-3333-3333-333333333301")

DEPT_TR_HQ   = uuid.UUID("33333333-3333-3333-3333-333333333302")

DEPT_FX_MX   = uuid.UUID("33333333-3333-3333-3333-333333333303")

DEPT_FX_LN   = uuid.UUID("33333333-3333-3333-3333-333333333304")



ROLES = [

    ("admin",          "Full system access",                             0,  True),

    ("cfo",            "Chief Financial Officer -- company-wide oversight", 1,  False),

    ("head_of_risk",   "Head of Risk -- cross-branch risk governance",    2,  False),

    ("branch_manager", "Branch Manager -- branch operations oversight",    3,  False),

    ("supervisor",     "Supervisor -- approve/reject staged artifacts",    5,  True),

    ("senior_analyst", "Senior FX Analyst -- production calculations",     7,  False),

    ("risk_analyst",   "Risk Analyst -- sandbox analysis & proposals",    10,  True),

    ("junior_analyst", "Junior Analyst -- view-only with limited actions",15,  False),

    ("auditor",        "Compliance Auditor -- read-only audit access",    12,  False),

]



ROLE_PERMS = {

    "admin": [p[0] for p in SEED_PERMISSIONS],

    "cfo": [

        "trades.view", "hedges.view", "calculate.run_sandbox",

        "pipeline.approve", "pipeline.reject", "pipeline.authorize_ledger",

        "policy.view", "policy.edit", "market.view",

        "reports.view_own_branch", "reports.view_all_branches",

        "reports.export_pdf", "reports.export_excel",

        "users.view", "company.view_settings", "company.edit_settings",

        "audit.view_own", "audit.view_branch", "audit.view_all",

        "overrides.override_subordinate",

    ],

    "head_of_risk": [

        "trades.view", "trades.create", "trades.edit", "trades.delete", "trades.import_csv",

        "hedges.view", "hedges.create", "hedges.edit", "hedges.delete",

        "calculate.run_sandbox", "calculate.run_production",

        "pipeline.create_proposal", "pipeline.submit_staging",

        "pipeline.approve", "pipeline.reject", "pipeline.authorize_ledger",

        "policy.view", "policy.edit", "policy.create_preset",

        "market.view", "market.edit", "market.autofill",

        "reports.view_own_branch", "reports.view_all_branches",

        "reports.export_pdf", "reports.export_excel",

        "users.view",

        "audit.view_own", "audit.view_branch", "audit.view_all",

        "overrides.override_subordinate",

    ],

    "branch_manager": [

        "trades.view", "trades.create", "trades.edit", "trades.delete", "trades.import_csv",

        "hedges.view", "hedges.create", "hedges.edit", "hedges.delete",

        "calculate.run_sandbox", "calculate.run_production",

        "pipeline.create_proposal", "pipeline.submit_staging",

        "pipeline.approve", "pipeline.reject",

        "policy.view", "policy.edit",

        "market.view", "market.edit", "market.autofill",

        "reports.view_own_branch", "reports.export_pdf", "reports.export_excel",

        "users.view",

        "audit.view_own", "audit.view_branch",

        "overrides.override_subordinate",

    ],

    "supervisor": [

        "trades.view", "trades.create", "trades.edit", "trades.delete", "trades.import_csv",

        "hedges.view", "hedges.create", "hedges.edit", "hedges.delete",

        "calculate.run_sandbox", "calculate.run_production",

        "pipeline.create_proposal", "pipeline.submit_staging",

        "pipeline.approve", "pipeline.reject",

        "policy.view", "policy.edit",

        "market.view", "market.edit", "market.autofill",

        "reports.view_own_branch", "reports.view_all_branches",

        "reports.export_pdf", "reports.export_excel",

        "users.view",

        "audit.view_own", "audit.view_branch",

        "overrides.override_subordinate",

    ],

    "senior_analyst": [

        "trades.view", "trades.create", "trades.edit", "trades.import_csv",

        "hedges.view", "hedges.create", "hedges.edit",

        "calculate.run_sandbox", "calculate.run_production",

        "pipeline.create_proposal", "pipeline.submit_staging",

        "policy.view",

        "market.view", "market.autofill",

        "reports.view_own_branch", "reports.export_pdf",

        "audit.view_own",

    ],

    "risk_analyst": [

        "trades.view", "trades.create", "trades.edit", "trades.import_csv",

        "hedges.view", "hedges.create", "hedges.edit",

        "calculate.run_sandbox",

        "pipeline.create_proposal",

        "policy.view",

        "market.view", "market.autofill",

        "reports.view_own_branch", "reports.export_pdf",

        "audit.view_own",

    ],

    "junior_analyst": [

        "trades.view", "hedges.view", "calculate.run_sandbox",

        "policy.view", "market.view",

        "reports.view_own_branch", "audit.view_own",

    ],

    "auditor": [

        "trades.view", "hedges.view", "policy.view", "market.view",

        "reports.view_own_branch", "reports.view_all_branches",

        "reports.export_pdf", "reports.export_excel",

        "audit.view_own", "audit.view_branch", "audit.view_all",

    ],

}



EMPLOYEES = [

    ("admin@synexcapital.com",       "Admin@2026!",     "System Administrator",   "Platform Admin",              "admin",          BRANCH_HQ_ID, DEPT_TR_HQ),

    ("r.chen@synexcapital.com",      "RChen@2026!",     "Richard Chen",           "Chief Financial Officer",     "cfo",            BRANCH_HQ_ID, DEPT_TR_HQ),

    ("s.williams@synexcapital.com",  "SWill@2026!",     "Sarah Williams",         "Head of FX Risk",            "head_of_risk",   BRANCH_HQ_ID, DEPT_FX_HQ),

    ("m.johnson@synexcapital.com",   "MJohn@2026!",     "Marcus Johnson",         "Senior FX Strategist",       "senior_analyst", BRANCH_HQ_ID, DEPT_FX_HQ),

    ("e.nakamura@synexcapital.com",  "ENaka@2026!",     "Emily Nakamura",         "FX Risk Analyst",            "risk_analyst",   BRANCH_HQ_ID, DEPT_FX_HQ),

    ("d.park@synexcapital.com",      "DPark@2026!",     "David Park",             "Compliance Auditor",         "auditor",        BRANCH_HQ_ID, DEPT_TR_HQ),

    ("j.ramirez@synexcapital.com",   "JRami@2026!",     "Javier Ramirez",         "Branch Manager -- LATAM",     "branch_manager", BRANCH_MX_ID, DEPT_FX_MX),

    ("c.ortega@synexcapital.com",    "COrtg@2026!",     "Camila Ortega",          "FX Desk Supervisor",         "supervisor",     BRANCH_MX_ID, DEPT_FX_MX),

    ("a.santos@synexcapital.com",    "ASant@2026!",     "Andres Santos",          "Senior LATAM Analyst",       "senior_analyst", BRANCH_MX_ID, DEPT_FX_MX),

    ("l.garcia@synexcapital.com",    "LGarc@2026!",     "Lucia Garcia",           "FX Risk Analyst",            "risk_analyst",   BRANCH_MX_ID, DEPT_FX_MX),

    ("p.hernandez@synexcapital.com", "PHern@2026!",     "Pablo Hernandez",        "Junior Analyst",             "junior_analyst", BRANCH_MX_ID, DEPT_FX_MX),

    ("n.baker@synexcapital.com",     "NBake@2026!",     "Natasha Baker",          "Branch Manager -- EMEA",      "branch_manager", BRANCH_LN_ID, DEPT_FX_LN),

    ("t.okonkwo@synexcapital.com",   "TOkon@2026!",     "Tunde Okonkwo",          "FX Desk Supervisor",         "supervisor",     BRANCH_LN_ID, DEPT_FX_LN),

    ("k.mueller@synexcapital.com",   "KMuel@2026!",     "Katrin Mueller",         "Senior EMEA Analyst",        "senior_analyst", BRANCH_LN_ID, DEPT_FX_LN),

    ("j.patel@synexcapital.com",     "JPate@2026!",     "Jai Patel",              "FX Risk Analyst",            "risk_analyst",   BRANCH_LN_ID, DEPT_FX_LN),



    # Demo account (partner demonstrations) -- real senior_analyst on HQ FX Risk Desk

    # Logs in as demo/demo; all data is live from the database (no static/fake data).

    ("demo",                         "demo",            "Demo User",              "FX Risk Analyst (Demo)",     "senior_analyst", BRANCH_HQ_ID, DEPT_FX_HQ),

]





@router.post("/company")

async def seed_company(

    db: AsyncSession = Depends(get_session),

    x_api_key: str = Header(..., alias="X-API-Key"),

):

    """One-time seed: create company, branches, departments, roles, users."""

    # Verify API key

    expected_keys = [

        getattr(settings, "HC_MASTER_KEY", None),

        "HC_DEV_KEY_001",

    ]

    if x_api_key not in [k for k in expected_keys if k]:

        raise HTTPException(status_code=403, detail="Invalid API key")



    results = {"permissions": 0, "roles": 0, "branches": 0, "departments": 0, "users": 0, "policy_templates": 0}



    try:

        # ?? Full schema migration via raw SQL ??

        from app.core.db import async_engine

        migration_sql = [

            "DROP INDEX IF EXISTS ix_permissions_module",



            # Core tables (FK dependency order)

            """CREATE TABLE IF NOT EXISTS companies (

                id UUID PRIMARY KEY, name VARCHAR(255) NOT NULL,

                slug VARCHAR(64) UNIQUE NOT NULL, domain VARCHAR(255),

                logo_url VARCHAR(512), settings JSONB,

                is_active BOOLEAN NOT NULL DEFAULT TRUE,

                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())""",



            """CREATE TABLE IF NOT EXISTS roles (

                id SERIAL PRIMARY KEY, name VARCHAR(64) NOT NULL UNIQUE,

                description VARCHAR(255),

                company_id UUID REFERENCES companies(id) ON DELETE CASCADE,

                hierarchy_level INTEGER NOT NULL DEFAULT 10,

                is_system BOOLEAN NOT NULL DEFAULT FALSE,

                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())""",



            """CREATE TABLE IF NOT EXISTS branches (

                id UUID PRIMARY KEY,

                company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

                name VARCHAR(255) NOT NULL, code VARCHAR(32) NOT NULL,

                region VARCHAR(128), timezone VARCHAR(64) DEFAULT 'UTC',

                is_active BOOLEAN NOT NULL DEFAULT TRUE,

                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                UNIQUE(company_id, code))""",



            """CREATE TABLE IF NOT EXISTS departments (

                id UUID PRIMARY KEY,

                branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,

                name VARCHAR(255) NOT NULL, code VARCHAR(32) NOT NULL,

                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                UNIQUE(branch_id, code))""",



            """CREATE TABLE IF NOT EXISTS users (

                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

                email VARCHAR(255) NOT NULL UNIQUE,

                hashed_password VARCHAR(255) NOT NULL,

                full_name VARCHAR(255),

                company_id UUID REFERENCES companies(id) ON DELETE SET NULL,

                branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,

                department_id UUID REFERENCES departments(id) ON DELETE SET NULL,

                job_title VARCHAR(128),

                is_active BOOLEAN NOT NULL DEFAULT TRUE,

                is_superuser BOOLEAN NOT NULL DEFAULT FALSE,

                token_version INTEGER NOT NULL DEFAULT 1,

                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())""",



            """CREATE TABLE IF NOT EXISTS user_roles (

                id SERIAL PRIMARY KEY,

                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

                role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,

                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                UNIQUE(user_id, role_id))""",



            """CREATE TABLE IF NOT EXISTS permissions (

                id SERIAL PRIMARY KEY, codename VARCHAR(128) UNIQUE NOT NULL,

                module VARCHAR(64) NOT NULL, action VARCHAR(64) NOT NULL,

                description VARCHAR(255) NOT NULL DEFAULT '',

                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())""",



            """CREATE TABLE IF NOT EXISTS role_permissions (

                id SERIAL PRIMARY KEY,

                role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,

                permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,

                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                UNIQUE(role_id, permission_id))""",



            """CREATE TABLE IF NOT EXISTS refresh_tokens (

                id SERIAL PRIMARY KEY, jti VARCHAR(64) NOT NULL UNIQUE,

                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

                expires_at TIMESTAMPTZ NOT NULL,

                revoked BOOLEAN NOT NULL DEFAULT FALSE,

                replaced_by_jti VARCHAR(64),

                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                created_ip VARCHAR(64), created_user_agent VARCHAR(256))""",



            # ALTER TABLE for pre-existing tables

            "ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL",

            "ALTER TABLE users ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL",

            "ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL",

            "ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title VARCHAR(128)",

            "ALTER TABLE roles ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE",

            "ALTER TABLE roles ADD COLUMN IF NOT EXISTS hierarchy_level INTEGER NOT NULL DEFAULT 10",

            "ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE",



            # Indexes

            "CREATE INDEX IF NOT EXISTS ix_users_company_id ON users(company_id)",

            "CREATE INDEX IF NOT EXISTS ix_users_branch_id ON users(branch_id)",

            "CREATE INDEX IF NOT EXISTS ix_roles_company_id ON roles(company_id)",

            "CREATE INDEX IF NOT EXISTS ix_permissions_codename ON permissions(codename)",

            "CREATE INDEX IF NOT EXISTS ix_permissions_module_col ON permissions(module)",

        ]



        for stmt in migration_sql:

            try:

                async with async_engine.begin() as conn:

                    await conn.execute(text(stmt))

            except Exception as e:

                logger.warning(f"Migration step skipped: {e}")

        logger.info("Schema migration complete")



        # ?? Company (must be created FIRST -- roles/users reference it) ??

        r = await db.execute(select(Company).where(Company.id == COMPANY_ID))

        if not r.scalars().first():

            db.add(Company(

                id=COMPANY_ID, name="Synex Capital Partners",

                slug="synex-capital", domain="synexcapital.com",

                settings={"default_currency": "USD", "risk_framework": "Basel III Enhanced"},

            ))

        await db.flush()



        # ?? Permissions ??

        for codename, module, action, desc in SEED_PERMISSIONS:

            r = await db.execute(select(Permission).where(Permission.codename == codename))

            if not r.scalars().first():

                db.add(Permission(codename=codename, module=module, action=action, description=desc))

                results["permissions"] += 1

        await db.flush()



        # ?? Roles (company now exists for company-scoped roles) ??

        role_map = {}

        for name, desc, level, is_sys in ROLES:

            r = await db.execute(select(Role).where(Role.name == name))

            role = r.scalars().first()

            if not role:

                role = Role(name=name, description=desc, hierarchy_level=level,

                            is_system=is_sys, company_id=COMPANY_ID if not is_sys else None)

                db.add(role)

                await db.flush()

                results["roles"] += 1

            else:

                role.hierarchy_level = level

                role.description = desc

            role_map[name] = role

        await db.flush()



        # ?? Role permissions ??

        for role_name, codenames in ROLE_PERMS.items():

            role = role_map.get(role_name)

            if not role:

                continue

            for codename in codenames:

                pr = await db.execute(select(Permission).where(Permission.codename == codename))

                perm = pr.scalars().first()

                if not perm:

                    continue

                er = await db.execute(

                    select(RolePermission).where(

                        RolePermission.role_id == role.id,

                        RolePermission.permission_id == perm.id,

                    )

                )

                if not er.scalars().first():

                    db.add(RolePermission(role_id=role.id, permission_id=perm.id))

        await db.flush()



        # ?? Branches ??

        for bid, bname, bcode, bregion, btz in [

            (BRANCH_HQ_ID, "Headquarters -- New York", "NYC", "North America", "America/New_York"),

            (BRANCH_MX_ID, "Mexico City Office",      "MXC", "LATAM",         "America/Mexico_City"),

            (BRANCH_LN_ID, "London Office",            "LDN", "EMEA",          "Europe/London"),

        ]:

            r = await db.execute(select(Branch).where(Branch.id == bid))

            if not r.scalars().first():

                db.add(Branch(id=bid, company_id=COMPANY_ID, name=bname, code=bcode, region=bregion, timezone=btz))

                results["branches"] += 1

        await db.flush()



        # ?? Departments ??

        for did, bid, dname, dcode in [

            (DEPT_FX_HQ, BRANCH_HQ_ID, "FX Risk Desk",        "FXD"),

            (DEPT_TR_HQ, BRANCH_HQ_ID, "Treasury Operations",  "TRE"),

            (DEPT_FX_MX, BRANCH_MX_ID, "FX Desk -- LATAM",      "FXL"),

            (DEPT_FX_LN, BRANCH_LN_ID, "FX Desk -- EMEA",       "FXE"),

        ]:

            r = await db.execute(select(Department).where(Department.id == did))

            if not r.scalars().first():

                db.add(Department(id=did, branch_id=bid, name=dname, code=dcode))

                results["departments"] += 1

        await db.flush()



        # ?? Users ??

        for email, pw, full_name, job_title, role_name, branch_id, dept_id in EMPLOYEES:

            r = await db.execute(select(User).where(User.email == email))

            user = r.scalars().first()

            if not user:

                user = User(

                    email=email, hashed_password=hash_password(pw),

                    full_name=full_name, job_title=job_title,

                    is_active=True, is_superuser=(role_name == "admin"),

                    company_id=COMPANY_ID, branch_id=branch_id, department_id=dept_id,

                )

                db.add(user)

                await db.flush()

                results["users"] += 1

            else:

                # Resync all fields including password so prod DB stays in sync

                user.hashed_password = hash_password(pw)

                user.full_name = full_name

                user.job_title = job_title

                user.is_active = True

                user.is_superuser = (role_name == "admin")

                user.company_id = COMPANY_ID

                user.branch_id = branch_id

                user.department_id = dept_id

                await db.flush()



            role = role_map.get(role_name)

            if role:

                er = await db.execute(

                    select(UserRole).where(UserRole.user_id == user.id, UserRole.role_id == role.id)

                )

                if not er.scalars().first():

                    db.add(UserRole(user_id=user.id, role_id=role.id))



        # ?? Policy Templates ??

        policy_templates_inserted = await _seed_policy_templates(db)

        results["policy_templates"] = policy_templates_inserted



        await db.commit()



        logger.info(f"Company seed complete: {results}")

        return {

            "status": "success",

            "company": "Synex Capital Partners",

            "created": results,

            "total_employees": len(EMPLOYEES),

            "total_roles": len(ROLES),

            "total_permissions": len(SEED_PERMISSIONS),

            "total_policy_templates": len(_POLICY_PRESETS_SEED),

        }



    except Exception as e:

        await db.rollback()

        logger.exception(f"Seed failed: {e}")

        raise HTTPException(status_code=500, detail=str(e))

