import type { TradeRow, HedgeRow, MarketSnapshot, PolicyConfig } from '../api/types';

// ─── Default market (USD/MXN baseline) ──────────────────────────────────────

export const DEFAULT_DEMO_MARKET: MarketSnapshot = {
  as_of: '2026-02-17T12:00:00Z',
  spot_usdmxn: 18.97,
  forward_points_by_month: {
    '2026-03': 0.048,
    '2026-04': 0.091,
    '2026-05': 0.138,
    '2026-06': 0.182,
  },
  provider_metadata: {
    source: 'hedgecalc_demo_fixture',
    data_class: 'DEMO',
    currency_pair: 'USD/MXN',
    primary_currency: 'MXN',
    note: 'Illustrative USD/MXN forward curve — institutional demo',
  },
};

export const DEFAULT_DEMO_POLICY: PolicyConfig = {
  bucket_mode: 'CALENDAR_MONTH',
  hedge_ratios: { confirmed: 0.80, forecast: 0.50 },
  cost_assumptions: { spread_bps: 5.0 },
  execution_product: 'NDF',
  min_trade_size_usd: 500000,
};

/* ── Demo Story Interface ── */

export interface DemoStory {
  companyName: string;
  industry: string;
  geographicExposure: string;
  problem: string;
  riskDescription: string;
  financialImpactWithoutHedge: string;
  objective: string;
  /** The resolution / outcome the hedge engine produces */
  resolution: string;
}

export interface DemoFixture {
  id: string;
  label: string;
  trades: TradeRow[];
  hedges: HedgeRow[];
  market: MarketSnapshot;
  policy: PolicyConfig;
  presetId: string;
  demoStory: DemoStory;
}

/* ══════════════════════════════════════════════════════════════════════════════
   FIXTURE 01 — Balanced Corporate (Mixed AP/AR · MXN · Manufacturing)
══════════════════════════════════════════════════════════════════════════════ */

const F01_TRADES: TradeRow[] = [
  { record_id: 'T001', entity: 'LatAm Corp', type: 'AP', currency: 'MXN', amount: 14_500_000, value_date: '2026-03-15', status: 'CONFIRMED', description: 'Supplier payment — raw materials Q1' },
  { record_id: 'T002', entity: 'LatAm Corp', type: 'AP', currency: 'MXN', amount: 9_200_000,  value_date: '2026-03-22', status: 'CONFIRMED', description: 'Equipment lease — Monterrey plant' },
  { record_id: 'T003', entity: 'LatAm Corp', type: 'AR', currency: 'MXN', amount: 7_100_000,  value_date: '2026-03-28', status: 'CONFIRMED', description: 'Export receivable — auto parts' },
  { record_id: 'T004', entity: 'LatAm Corp', type: 'AP', currency: 'MXN', amount: 4_800_000,  value_date: '2026-03-30', status: 'FORECAST',  description: 'Projected supplier payment' },
  { record_id: 'T005', entity: 'LatAm Corp', type: 'AP', currency: 'MXN', amount: 16_800_000, value_date: '2026-04-10', status: 'CONFIRMED', description: 'Component supplier — quarterly' },
  { record_id: 'T006', entity: 'LatAm Corp', type: 'AR', currency: 'MXN', amount: 3_500_000,  value_date: '2026-04-18', status: 'FORECAST',  description: 'Projected export receivable' },
  { record_id: 'T007', entity: 'LatAm Corp', type: 'AP', currency: 'MXN', amount: 8_200_000,  value_date: '2026-04-25', status: 'CONFIRMED', description: 'Service contract — logistics' },
  { record_id: 'T008', entity: 'LatAm Corp', type: 'AR', currency: 'MXN', amount: 10_500_000, value_date: '2026-05-08', status: 'CONFIRMED', description: 'Large export receivable — Q2' },
  { record_id: 'T009', entity: 'LatAm Corp', type: 'AP', currency: 'MXN', amount: 12_300_000, value_date: '2026-05-15', status: 'CONFIRMED', description: 'Quarterly supplier settlement' },
  { record_id: 'T010', entity: 'LatAm Corp', type: 'AP', currency: 'MXN', amount: 2_800_000,  value_date: '2026-05-28', status: 'FORECAST',  description: 'Projected miscellaneous payment' },
  { record_id: 'T011', entity: 'LatAm Corp', type: 'AR', currency: 'MXN', amount: 5_600_000,  value_date: '2026-06-05', status: 'CONFIRMED', description: 'EU customer receivable — components' },
  { record_id: 'T012', entity: 'LatAm Corp', type: 'AP', currency: 'MXN', amount: 7_400_000,  value_date: '2026-06-20', status: 'FORECAST',  description: 'Projected energy costs' },
];

const F01_HEDGES: HedgeRow[] = [
  { hedge_id: 'H001', instrument: 'NDF', direction: 'SELL_MXN_BUY_USD', notional_mxn: 12_000_000, value_date: '2026-03-15', status: 'ACTIVE' },
  { hedge_id: 'H002', instrument: 'NDF', direction: 'SELL_MXN_BUY_USD', notional_mxn: 9_500_000,  value_date: '2026-04-10', status: 'ACTIVE' },
  { hedge_id: 'H003', instrument: 'FWD', direction: 'SELL_MXN_BUY_USD', notional_mxn: 6_000_000,  value_date: '2026-05-08', status: 'LOCKED' },
];

/* ══════════════════════════════════════════════════════════════════════════════
   FIXTURE 02 — Importer Heavy AP (Mexico manufacturing · USD/MXN)
══════════════════════════════════════════════════════════════════════════════ */

const F02_TRADES: TradeRow[] = [
  { record_id: 'IMP-001', entity: 'MexImport SA', type: 'AP', currency: 'MXN', amount: 22_000_000, value_date: '2026-03-10', status: 'CONFIRMED', description: 'Raw material — steel Q1' },
  { record_id: 'IMP-002', entity: 'MexImport SA', type: 'AP', currency: 'MXN', amount: 18_500_000, value_date: '2026-03-20', status: 'CONFIRMED', description: 'Electronics components — assembly' },
  { record_id: 'IMP-003', entity: 'MexImport SA', type: 'AP', currency: 'MXN', amount: 11_000_000, value_date: '2026-03-28', status: 'CONFIRMED', description: 'Chemical supplies — production' },
  { record_id: 'IMP-004', entity: 'MexImport SA', type: 'AR', currency: 'MXN', amount: 4_200_000,  value_date: '2026-04-05', status: 'FORECAST',  description: 'Domestic sales receivable' },
  { record_id: 'IMP-005', entity: 'MexImport SA', type: 'AP', currency: 'MXN', amount: 15_600_000, value_date: '2026-04-12', status: 'CONFIRMED', description: 'Machinery parts — quarterly order' },
  { record_id: 'IMP-006', entity: 'MexImport SA', type: 'AP', currency: 'MXN', amount: 9_800_000,  value_date: '2026-04-22', status: 'FORECAST',  description: 'Projected packaging materials' },
  { record_id: 'IMP-007', entity: 'MexImport SA', type: 'AR', currency: 'MXN', amount: 5_500_000,  value_date: '2026-05-01', status: 'CONFIRMED', description: 'Export sale — finished goods' },
  { record_id: 'IMP-008', entity: 'MexImport SA', type: 'AP', currency: 'MXN', amount: 19_200_000, value_date: '2026-05-15', status: 'CONFIRMED', description: 'Major supplier settlement — Q2' },
  { record_id: 'IMP-009', entity: 'MexImport SA', type: 'AP', currency: 'MXN', amount: 7_300_000,  value_date: '2026-05-28', status: 'FORECAST',  description: 'Projected maintenance contracts' },
  { record_id: 'IMP-010', entity: 'MexImport SA', type: 'AP', currency: 'MXN', amount: 13_100_000, value_date: '2026-06-10', status: 'CONFIRMED', description: 'Semi-annual equipment overhaul' },
];

const F02_HEDGES: HedgeRow[] = [
  { hedge_id: 'IH-001', instrument: 'NDF', direction: 'SELL_MXN_BUY_USD', notional_mxn: 18_000_000, value_date: '2026-03-15', status: 'ACTIVE' },
  { hedge_id: 'IH-002', instrument: 'NDF', direction: 'SELL_MXN_BUY_USD', notional_mxn: 14_000_000, value_date: '2026-04-15', status: 'ACTIVE' },
];

/* ══════════════════════════════════════════════════════════════════════════════
   FIXTURE 03 — Exporter Heavy AR (MexExport · USD/MXN)
══════════════════════════════════════════════════════════════════════════════ */

const F03_TRADES: TradeRow[] = [
  { record_id: 'EXP-001', entity: 'MexExport Global', type: 'AR', currency: 'MXN', amount: 25_000_000, value_date: '2026-03-12', status: 'CONFIRMED', description: 'Auto parts — US OEM customer' },
  { record_id: 'EXP-002', entity: 'MexExport Global', type: 'AR', currency: 'MXN', amount: 18_000_000, value_date: '2026-03-25', status: 'CONFIRMED', description: 'Agricultural export — Q1 shipment' },
  { record_id: 'EXP-003', entity: 'MexExport Global', type: 'AP', currency: 'MXN', amount: 6_500_000,  value_date: '2026-03-30', status: 'CONFIRMED', description: 'Domestic logistics payment' },
  { record_id: 'EXP-004', entity: 'MexExport Global', type: 'AR', currency: 'MXN', amount: 12_500_000, value_date: '2026-04-08', status: 'FORECAST',  description: 'Projected mining export receivable' },
  { record_id: 'EXP-005', entity: 'MexExport Global', type: 'AR', currency: 'MXN', amount: 21_000_000, value_date: '2026-04-20', status: 'CONFIRMED', description: 'Aerospace components — contract' },
  { record_id: 'EXP-006', entity: 'MexExport Global', type: 'AP', currency: 'MXN', amount: 4_800_000,  value_date: '2026-04-28', status: 'FORECAST',  description: 'Projected port handling fees' },
  { record_id: 'EXP-007', entity: 'MexExport Global', type: 'AR', currency: 'MXN', amount: 16_000_000, value_date: '2026-05-10', status: 'CONFIRMED', description: 'Textiles — EU market' },
  { record_id: 'EXP-008', entity: 'MexExport Global', type: 'AR', currency: 'MXN', amount: 9_500_000,  value_date: '2026-05-22', status: 'FORECAST',  description: 'Projected food processing export' },
  { record_id: 'EXP-009', entity: 'MexExport Global', type: 'AR', currency: 'MXN', amount: 14_200_000, value_date: '2026-06-06', status: 'CONFIRMED', description: 'Medical devices — North America' },
  { record_id: 'EXP-010', entity: 'MexExport Global', type: 'AP', currency: 'MXN', amount: 3_100_000,  value_date: '2026-06-15', status: 'FORECAST',  description: 'Compliance costs — COFEPRIS' },
];

const F03_HEDGES: HedgeRow[] = [
  { hedge_id: 'EH-001', instrument: 'FWD', direction: 'BUY_MXN_SELL_USD', notional_mxn: 20_000_000, value_date: '2026-03-15', status: 'ACTIVE' },
  { hedge_id: 'EH-002', instrument: 'NDF', direction: 'BUY_MXN_SELL_USD', notional_mxn: 15_000_000, value_date: '2026-04-20', status: 'ACTIVE' },
  { hedge_id: 'EH-003', instrument: 'FWD', direction: 'BUY_MXN_SELL_USD', notional_mxn: 10_000_000, value_date: '2026-05-10', status: 'LOCKED' },
];

/* ══════════════════════════════════════════════════════════════════════════════
   FIXTURE 04 — Volatile Market Stress (USD/MXN · elevated curve)
══════════════════════════════════════════════════════════════════════════════ */

const F04_MARKET: MarketSnapshot = {
  as_of: '2026-02-17T12:00:00Z',
  spot_usdmxn: 21.40,
  forward_points_by_month: {
    '2026-03': 0.185,
    '2026-04': 0.350,
    '2026-05': 0.520,
    '2026-06': 0.710,
  },
  provider_metadata: { source: 'hedgecalc_demo_fixture', data_class: 'DEMO', currency_pair: 'USD/MXN', primary_currency: 'MXN', note: 'Stress scenario — MXN depreciation + steep forward curve' },
};

/* ══════════════════════════════════════════════════════════════════════════════
   FIXTURE 05 — European Subsidiary (EUR · German manufacturer)
══════════════════════════════════════════════════════════════════════════════ */

const F05_TRADES: TradeRow[] = [
  { record_id: 'EUR-001', entity: 'BavariaGmbH',  type: 'AR', currency: 'EUR', amount: 2_800_000, value_date: '2026-03-14', status: 'CONFIRMED', description: 'Machinery export — US distributor (invoiced EUR)' },
  { record_id: 'EUR-002', entity: 'BavariaGmbH',  type: 'AP', currency: 'EUR', amount: 1_200_000, value_date: '2026-03-22', status: 'CONFIRMED', description: 'USD-settled raw material import, EUR hedge needed' },
  { record_id: 'EUR-003', entity: 'BavariaGmbH',  type: 'AR', currency: 'EUR', amount: 3_500_000, value_date: '2026-04-10', status: 'CONFIRMED', description: 'Automotive OEM contract — quarterly billing' },
  { record_id: 'EUR-004', entity: 'BavariaGmbH',  type: 'AR', currency: 'EUR', amount: 1_850_000, value_date: '2026-04-25', status: 'FORECAST',  description: 'Projected: defense contract milestone' },
  { record_id: 'EUR-005', entity: 'BavariaGmbH',  type: 'AP', currency: 'EUR', amount: 680_000,   value_date: '2026-05-05', status: 'CONFIRMED', description: 'IT license fees — US vendor' },
  { record_id: 'EUR-006', entity: 'BavariaGmbH',  type: 'AR', currency: 'EUR', amount: 2_200_000, value_date: '2026-05-18', status: 'CONFIRMED', description: 'Chemical plant equipment — EM clients' },
  { record_id: 'EUR-007', entity: 'BavariaGmbH',  type: 'AP', currency: 'EUR', amount: 940_000,   value_date: '2026-05-28', status: 'FORECAST',  description: 'Projected cloud infrastructure — AWS EUR' },
  { record_id: 'EUR-008', entity: 'BavariaGmbH',  type: 'AR', currency: 'EUR', amount: 4_100_000, value_date: '2026-06-12', status: 'CONFIRMED', description: 'Rail infrastructure export — Middle East' },
];

const F05_MARKET: MarketSnapshot = {
  as_of: '2026-02-17T12:00:00Z',
  spot_usdmxn: 1.0850,  // EUR/USD expressed as USD per EUR (inverted: spot for USD/EUR = 1/1.0850)
  forward_points_by_month: {
    '2026-03': -0.0012,
    '2026-04': -0.0024,
    '2026-05': -0.0036,
    '2026-06': -0.0048,
  },
  provider_metadata: { source: 'hedgecalc_demo_fixture', data_class: 'DEMO', currency_pair: 'EUR/USD', primary_currency: 'EUR', note: 'EUR/USD demo — negative forward pts (USD rates > EUR rates)' },
};

const F05_HEDGES: HedgeRow[] = [
  { hedge_id: 'EH-E01', instrument: 'FWD', direction: 'SELL_MXN_BUY_USD', notional_mxn: 2_000_000, value_date: '2026-03-14', status: 'ACTIVE' },
  { hedge_id: 'EH-E02', instrument: 'NDF', direction: 'SELL_MXN_BUY_USD', notional_mxn: 2_800_000, value_date: '2026-04-10', status: 'ACTIVE' },
];

const F05_POLICY: PolicyConfig = {
  bucket_mode: 'CALENDAR_MONTH',
  hedge_ratios: { confirmed: 0.85, forecast: 0.60 },
  cost_assumptions: { spread_bps: 3.5 },
  execution_product: 'FWD',
  min_trade_size_usd: 250_000,
};

/* ══════════════════════════════════════════════════════════════════════════════
   FIXTURE 06 — Brazilian Real (BRL · cross-border commodities)
══════════════════════════════════════════════════════════════════════════════ */

const F06_TRADES: TradeRow[] = [
  { record_id: 'BRL-001', entity: 'AgroExport Brasil', type: 'AR', currency: 'BRL', amount: 32_000_000, value_date: '2026-03-10', status: 'CONFIRMED', description: 'Soybean export — China contract' },
  { record_id: 'BRL-002', entity: 'AgroExport Brasil', type: 'AR', currency: 'BRL', amount: 18_500_000, value_date: '2026-03-25', status: 'CONFIRMED', description: 'Corn export — EU customer' },
  { record_id: 'BRL-003', entity: 'AgroExport Brasil', type: 'AP', currency: 'BRL', amount: 8_200_000,  value_date: '2026-04-02', status: 'CONFIRMED', description: 'Freight & logistics — USD invoice' },
  { record_id: 'BRL-004', entity: 'AgroExport Brasil', type: 'AR', currency: 'BRL', amount: 24_000_000, value_date: '2026-04-15', status: 'FORECAST',  description: 'Projected sugar export — US market' },
  { record_id: 'BRL-005', entity: 'AgroExport Brasil', type: 'AP', currency: 'BRL', amount: 5_600_000,  value_date: '2026-04-28', status: 'CONFIRMED', description: 'Fertilizer import — Middle East' },
  { record_id: 'BRL-006', entity: 'AgroExport Brasil', type: 'AR', currency: 'BRL', amount: 41_000_000, value_date: '2026-05-08', status: 'CONFIRMED', description: 'Beef export — annual contract tranche' },
  { record_id: 'BRL-007', entity: 'AgroExport Brasil', type: 'AP', currency: 'BRL', amount: 9_800_000,  value_date: '2026-05-20', status: 'FORECAST',  description: 'Projected: port handling & duties' },
  { record_id: 'BRL-008', entity: 'AgroExport Brasil', type: 'AR', currency: 'BRL', amount: 15_200_000, value_date: '2026-06-05', status: 'CONFIRMED', description: 'Coffee export — specialty grade' },
  { record_id: 'BRL-009', entity: 'AgroExport Brasil', type: 'AP', currency: 'BRL', amount: 4_100_000,  value_date: '2026-06-18', status: 'FORECAST',  description: 'Projected crop insurance premiums' },
  { record_id: 'BRL-010', entity: 'AgroExport Brasil', type: 'AR', currency: 'BRL', amount: 28_700_000, value_date: '2026-06-28', status: 'CONFIRMED', description: 'Iron ore royalty — mining JV' },
];

const F06_MARKET: MarketSnapshot = {
  as_of: '2026-02-17T12:00:00Z',
  spot_usdmxn: 5.0450,  // USD/BRL
  forward_points_by_month: {
    '2026-03': 0.085,
    '2026-04': 0.172,
    '2026-05': 0.261,
    '2026-06': 0.354,
  },
  provider_metadata: { source: 'hedgecalc_demo_fixture', data_class: 'DEMO', currency_pair: 'USD/BRL', primary_currency: 'BRL', note: 'USD/BRL NDF market — high carry due to SELIC rate differential' },
};

const F06_HEDGES: HedgeRow[] = [
  { hedge_id: 'BH-001', instrument: 'NDF', direction: 'BUY_MXN_SELL_USD', notional_mxn: 28_000_000, value_date: '2026-03-15', status: 'ACTIVE' },
  { hedge_id: 'BH-002', instrument: 'NDF', direction: 'BUY_MXN_SELL_USD', notional_mxn: 22_000_000, value_date: '2026-04-20', status: 'ACTIVE' },
];

const F06_POLICY: PolicyConfig = {
  bucket_mode: 'CALENDAR_MONTH',
  hedge_ratios: { confirmed: 0.75, forecast: 0.45 },
  cost_assumptions: { spread_bps: 8.0 },
  execution_product: 'NDF',
  min_trade_size_usd: 500_000,
};

/* ══════════════════════════════════════════════════════════════════════════════
   FIXTURE 07 — Japanese Yen (JPY · electronics manufacturer)
══════════════════════════════════════════════════════════════════════════════ */

const F07_TRADES: TradeRow[] = [
  { record_id: 'JPY-001', entity: 'NipponTech KK',  type: 'AR', currency: 'JPY', amount: 280_000_000, value_date: '2026-03-20', status: 'CONFIRMED', description: 'Consumer electronics — US retail (JPY invoiced)' },
  { record_id: 'JPY-002', entity: 'NipponTech KK',  type: 'AP', currency: 'JPY', amount: 95_000_000,  value_date: '2026-03-28', status: 'CONFIRMED', description: 'Rare earth materials — China import' },
  { record_id: 'JPY-003', entity: 'NipponTech KK',  type: 'AR', currency: 'JPY', amount: 410_000_000, value_date: '2026-04-12', status: 'CONFIRMED', description: 'Semiconductor IP license — US tech firm' },
  { record_id: 'JPY-004', entity: 'NipponTech KK',  type: 'AR', currency: 'JPY', amount: 155_000_000, value_date: '2026-04-25', status: 'FORECAST',  description: 'Projected EV battery module export' },
  { record_id: 'JPY-005', entity: 'NipponTech KK',  type: 'AP', currency: 'JPY', amount: 62_000_000,  value_date: '2026-05-08', status: 'CONFIRMED', description: 'Assembly plant lease — Malaysia' },
  { record_id: 'JPY-006', entity: 'NipponTech KK',  type: 'AR', currency: 'JPY', amount: 330_000_000, value_date: '2026-05-22', status: 'CONFIRMED', description: 'Robotics export — German automotive OEM' },
  { record_id: 'JPY-007', entity: 'NipponTech KK',  type: 'AP', currency: 'JPY', amount: 78_000_000,  value_date: '2026-06-05', status: 'FORECAST',  description: 'Projected energy procurement — LNG' },
  { record_id: 'JPY-008', entity: 'NipponTech KK',  type: 'AR', currency: 'JPY', amount: 195_000_000, value_date: '2026-06-18', status: 'CONFIRMED', description: 'Medical imaging devices — APAC distribution' },
];

const F07_MARKET: MarketSnapshot = {
  as_of: '2026-02-17T12:00:00Z',
  spot_usdmxn: 149.80,  // USD/JPY
  forward_points_by_month: {
    '2026-03': -0.45,
    '2026-04': -0.88,
    '2026-05': -1.32,
    '2026-06': -1.78,
  },
  provider_metadata: { source: 'hedgecalc_demo_fixture', data_class: 'DEMO', currency_pair: 'USD/JPY', primary_currency: 'JPY', note: 'USD/JPY — negative forward pts (BOJ policy lag vs Fed)' },
};

const F07_HEDGES: HedgeRow[] = [
  { hedge_id: 'JH-001', instrument: 'FWD', direction: 'BUY_MXN_SELL_USD', notional_mxn: 240_000_000, value_date: '2026-03-20', status: 'ACTIVE' },
  { hedge_id: 'JH-002', instrument: 'FWD', direction: 'BUY_MXN_SELL_USD', notional_mxn: 320_000_000, value_date: '2026-04-15', status: 'ACTIVE' },
];

const F07_POLICY: PolicyConfig = {
  bucket_mode: 'CALENDAR_MONTH',
  hedge_ratios: { confirmed: 0.90, forecast: 0.55 },
  cost_assumptions: { spread_bps: 2.5 },
  execution_product: 'FWD',
  min_trade_size_usd: 1_000_000,
};

/* ══════════════════════════════════════════════════════════════════════════════
   FIXTURE 08 — South African Rand (ZAR · mining company)
══════════════════════════════════════════════════════════════════════════════ */

const F08_TRADES: TradeRow[] = [
  { record_id: 'ZAR-001', entity: 'AurusMining SA',  type: 'AR', currency: 'ZAR', amount: 85_000_000, value_date: '2026-03-15', status: 'CONFIRMED', description: 'Gold export — LBMA contract settlement' },
  { record_id: 'ZAR-002', entity: 'AurusMining SA',  type: 'AP', currency: 'ZAR', amount: 32_000_000, value_date: '2026-03-22', status: 'CONFIRMED', description: 'Mining equipment — Caterpillar USD invoice' },
  { record_id: 'ZAR-003', entity: 'AurusMining SA',  type: 'AR', currency: 'ZAR', amount: 62_000_000, value_date: '2026-04-08', status: 'CONFIRMED', description: 'Platinum group metals — industrial buyer' },
  { record_id: 'ZAR-004', entity: 'AurusMining SA',  type: 'AP', currency: 'ZAR', amount: 18_500_000, value_date: '2026-04-18', status: 'FORECAST',  description: 'Projected: explosives supply contract' },
  { record_id: 'ZAR-005', entity: 'AurusMining SA',  type: 'AR', currency: 'ZAR', amount: 110_000_000, value_date: '2026-05-02', status: 'CONFIRMED', description: 'Palladium export — US auto catalyst buyer' },
  { record_id: 'ZAR-006', entity: 'AurusMining SA',  type: 'AP', currency: 'ZAR', amount: 24_000_000, value_date: '2026-05-15', status: 'CONFIRMED', description: 'Energy costs — Eskom contract' },
  { record_id: 'ZAR-007', entity: 'AurusMining SA',  type: 'AR', currency: 'ZAR', amount: 48_000_000, value_date: '2026-05-28', status: 'FORECAST',  description: 'Projected: diamond rough parcel — Antwerp' },
  { record_id: 'ZAR-008', entity: 'AurusMining SA',  type: 'AP', currency: 'ZAR', amount: 14_200_000, value_date: '2026-06-10', status: 'CONFIRMED', description: 'Royalty payment — government minerals board' },
];

const F08_MARKET: MarketSnapshot = {
  as_of: '2026-02-17T12:00:00Z',
  spot_usdmxn: 18.35,  // USD/ZAR
  forward_points_by_month: {
    '2026-03': 0.148,
    '2026-04': 0.298,
    '2026-05': 0.451,
    '2026-06': 0.607,
  },
  provider_metadata: { source: 'hedgecalc_demo_fixture', data_class: 'DEMO', currency_pair: 'USD/ZAR', primary_currency: 'ZAR', note: 'USD/ZAR NDF — steep carry driven by SARB rate differential' },
};

const F08_HEDGES: HedgeRow[] = [
  { hedge_id: 'ZH-001', instrument: 'NDF', direction: 'BUY_MXN_SELL_USD', notional_mxn: 70_000_000, value_date: '2026-03-15', status: 'ACTIVE' },
  { hedge_id: 'ZH-002', instrument: 'NDF', direction: 'BUY_MXN_SELL_USD', notional_mxn: 55_000_000, value_date: '2026-04-10', status: 'ACTIVE' },
];

const F08_POLICY: PolicyConfig = {
  bucket_mode: 'CALENDAR_MONTH',
  hedge_ratios: { confirmed: 0.70, forecast: 0.40 },
  cost_assumptions: { spread_bps: 12.0 },
  execution_product: 'NDF',
  min_trade_size_usd: 250_000,
};

/* ══════════════════════════════════════════════════════════════════════════════
   FIXTURE 09 — Multi-Currency Treasury (Global conglomerate · MXN+EUR+JPY)
══════════════════════════════════════════════════════════════════════════════ */

const F09_TRADES: TradeRow[] = [
  { record_id: 'MCT-001', entity: 'GrupoGlobal SA', type: 'AP', currency: 'MXN', amount: 45_000_000, value_date: '2026-03-12', status: 'CONFIRMED', description: 'MXN payable — domestic supplier (Subsidiary MX)' },
  { record_id: 'MCT-002', entity: 'GrupoGlobal SA', type: 'AR', currency: 'EUR', amount: 3_200_000,  value_date: '2026-03-18', status: 'CONFIRMED', description: 'EUR receivable — EU automotive OEM (Sub DE)' },
  { record_id: 'MCT-003', entity: 'GrupoGlobal SA', type: 'AR', currency: 'JPY', amount: 350_000_000, value_date: '2026-03-25', status: 'CONFIRMED', description: 'JPY receivable — electronics contract (Sub JP)' },
  { record_id: 'MCT-004', entity: 'GrupoGlobal SA', type: 'AP', currency: 'MXN', amount: 28_000_000, value_date: '2026-04-05', status: 'FORECAST',  description: 'Projected MXN payable — energy Q2' },
  { record_id: 'MCT-005', entity: 'GrupoGlobal SA', type: 'AR', currency: 'MXN', amount: 19_500_000, value_date: '2026-04-14', status: 'CONFIRMED', description: 'MXN receivable — government contract' },
  { record_id: 'MCT-006', entity: 'GrupoGlobal SA', type: 'AP', currency: 'EUR', amount: 1_800_000,  value_date: '2026-04-22', status: 'CONFIRMED', description: 'EUR payable — technology licensing (Sub DE)' },
  { record_id: 'MCT-007', entity: 'GrupoGlobal SA', type: 'AR', currency: 'BRL', amount: 22_000_000, value_date: '2026-05-06', status: 'FORECAST',  description: 'Projected BRL receivable — LatAm distribution' },
  { record_id: 'MCT-008', entity: 'GrupoGlobal SA', type: 'AP', currency: 'MXN', amount: 34_000_000, value_date: '2026-05-15', status: 'CONFIRMED', description: 'MXN payable — large infrastructure supplier' },
  { record_id: 'MCT-009', entity: 'GrupoGlobal SA', type: 'AR', currency: 'JPY', amount: 185_000_000, value_date: '2026-06-02', status: 'CONFIRMED', description: 'JPY receivable — IP royalty semi-annual' },
  { record_id: 'MCT-010', entity: 'GrupoGlobal SA', type: 'AP', currency: 'EUR', amount: 2_400_000,  value_date: '2026-06-18', status: 'FORECAST',  description: 'Projected EUR payable — EU compliance costs' },
];

const F09_HEDGES: HedgeRow[] = [
  { hedge_id: 'MCH-001', instrument: 'NDF', direction: 'SELL_MXN_BUY_USD', notional_mxn: 35_000_000, value_date: '2026-03-15', status: 'ACTIVE' },
  { hedge_id: 'MCH-002', instrument: 'FWD', direction: 'SELL_MXN_BUY_USD', notional_mxn: 25_000_000, value_date: '2026-04-10', status: 'ACTIVE' },
];

const F09_POLICY: PolicyConfig = {
  bucket_mode: 'CALENDAR_MONTH',
  hedge_ratios: { confirmed: 0.80, forecast: 0.50 },
  cost_assumptions: { spread_bps: 5.0 },
  execution_product: 'NDF',
  min_trade_size_usd: 500_000,
};

/* ══════════════════════════════════════════════════════════════════════════════
   FIXTURE 10 — Turkish Lira (TRY · construction / infrastructure)
══════════════════════════════════════════════════════════════════════════════ */

const F10_TRADES: TradeRow[] = [
  { record_id: 'TRY-001', entity: 'AnadoluInşaat', type: 'AP', currency: 'TRY', amount: 420_000_000, value_date: '2026-03-10', status: 'CONFIRMED', description: 'USD-denominated steel import — USD invoice settled in TRY' },
  { record_id: 'TRY-002', entity: 'AnadoluInşaat', type: 'AR', currency: 'TRY', amount: 185_000_000, value_date: '2026-03-22', status: 'CONFIRMED', description: 'Government infrastructure contract — USD-linked TRY payment' },
  { record_id: 'TRY-003', entity: 'AnadoluInşaat', type: 'AP', currency: 'TRY', amount: 290_000_000, value_date: '2026-04-05', status: 'CONFIRMED', description: 'Cement & materials import — EU supplier' },
  { record_id: 'TRY-004', entity: 'AnadoluInşaat', type: 'AR', currency: 'TRY', amount: 140_000_000, value_date: '2026-04-18', status: 'FORECAST',  description: 'Projected project milestone — highway contract' },
  { record_id: 'TRY-005', entity: 'AnadoluInşaat', type: 'AP', currency: 'TRY', amount: 510_000_000, value_date: '2026-05-02', status: 'CONFIRMED', description: 'Heavy machinery — Germany (EUR invoice)' },
  { record_id: 'TRY-006', entity: 'AnadoluInşaat', type: 'AR', currency: 'TRY', amount: 220_000_000, value_date: '2026-05-14', status: 'CONFIRMED', description: 'Airport terminal handover — government client' },
  { record_id: 'TRY-007', entity: 'AnadoluInşaat', type: 'AP', currency: 'TRY', amount: 175_000_000, value_date: '2026-05-28', status: 'FORECAST',  description: 'Projected subcontractor payments' },
  { record_id: 'TRY-008', entity: 'AnadoluInşaat', type: 'AR', currency: 'TRY', amount: 310_000_000, value_date: '2026-06-10', status: 'CONFIRMED', description: 'Residential development sale — USD-indexed' },
];

const F10_MARKET: MarketSnapshot = {
  as_of: '2026-02-17T12:00:00Z',
  spot_usdmxn: 32.85,   // USD/TRY
  forward_points_by_month: {
    '2026-03': 1.420,
    '2026-04': 2.880,
    '2026-05': 4.380,
    '2026-06': 5.920,
  },
  provider_metadata: { source: 'hedgecalc_demo_fixture', data_class: 'DEMO', currency_pair: 'USD/TRY', primary_currency: 'TRY', note: 'USD/TRY NDF — very steep curve driven by 45%+ TCMB rate vs Fed' },
};

const F10_HEDGES: HedgeRow[] = [
  { hedge_id: 'TH-001', instrument: 'NDF', direction: 'SELL_MXN_BUY_USD', notional_mxn: 350_000_000, value_date: '2026-03-15', status: 'ACTIVE' },
  { hedge_id: 'TH-002', instrument: 'NDF', direction: 'SELL_MXN_BUY_USD', notional_mxn: 280_000_000, value_date: '2026-04-10', status: 'ACTIVE' },
];

const F10_POLICY: PolicyConfig = {
  bucket_mode: 'CALENDAR_MONTH',
  hedge_ratios: { confirmed: 0.95, forecast: 0.70 },
  cost_assumptions: { spread_bps: 18.0 },
  execution_product: 'NDF',
  min_trade_size_usd: 250_000,
};

/* ══════════════════════════════════════════════════════════════════════════════
   FIXTURE REGISTRY
══════════════════════════════════════════════════════════════════════════════ */

export const DEMO_FIXTURES: DemoFixture[] = [
  {
    id: '2026_CORPORATE_BALANCED',
    label: 'Balanced Corporate',
    trades: F01_TRADES, hedges: F01_HEDGES, market: DEFAULT_DEMO_MARKET, policy: DEFAULT_DEMO_POLICY,
    presetId: 'balanced-corporate',
    demoStory: {
      companyName: 'LatAm Corp',
      industry: 'Manufacturing (Auto Parts)',
      geographicExposure: 'Mexico-based manufacturer — mixed USD/MXN AP & AR across import-dependent production and export sales',
      problem: 'Quarterly operating cash flows are exposed to MXN volatility on both sides of the book — AP from USD-denominated supplier contracts and AR from USD-priced export sales, creating margin compression risk in either FX direction.',
      riskDescription: 'Net short MXN in Q1/Q2 2026 with concentrated AP > AR. Unhedged exposure creates ~5% quarterly margin variance. A 10% MXN appreciation vs USD would increase input costs by MXN 6.2M on confirmed payables alone.',
      financialImpactWithoutHedge: 'Worst-case unhedged variance: ~MXN 8.5M on a USD 18.97 spot. Annualised: MXN 34M cash flow at risk. Earnings guidance accuracy degrades significantly without a hedge ladder.',
      objective: 'Stabilise quarterly cash flows through a calendar-month hedge ladder. Target 80% confirmed exposure and 50% forecast. Minimise worst-case downside while preserving operational flexibility for business growth.',
      resolution: 'HedgeCore generates a 4-bucket NDF ladder (Mar–Jun 2026) covering MXN 47.6M confirmed net exposure. Net hedge cost of MXN 312K. Cash flow variance reduced from 5.2% to 0.8% of quarterly revenue at 95th percentile.',
    },
  },
  {
    id: '2026_IMPORTER_HEAVY_AP',
    label: 'Importer Heavy AP',
    trades: F02_TRADES, hedges: F02_HEDGES, market: DEFAULT_DEMO_MARKET, policy: DEFAULT_DEMO_POLICY,
    presetId: 'balanced-corporate',
    demoStory: {
      companyName: 'MexImport SA',
      industry: 'Import-Dependent Manufacturing',
      geographicExposure: 'Heavy reliance on USD-denominated raw material imports settled in MXN. Majority AP exposure with minimal AR offset — 87% net short MXN.',
      problem: 'Concentrated import payment schedule in Q1–Q2 2026. MXN depreciation directly increases input costs. No natural hedge from domestic sales. Forward curve in contango (+91 bps at 4 months) — cost of delay compounds.',
      riskDescription: 'MXN 126.8M confirmed AP vs MXN 9.7M confirmed AR. Net short MXN 117.1M. A 5% MXN depreciation costs ~MXN 5.9M on confirmed payables. Quarterly settlement cycles amplify spot exposure.',
      financialImpactWithoutHedge: 'MXN 5.9M adverse impact per 5% MXN depreciation. Annualised: MXN 23.5M at risk from unhedged input cost volatility. Competitive pricing erodes within 2 quarters of sustained MXN weakness.',
      objective: 'Lock in forward rates for confirmed import obligations via NDF. Target 80% confirmed hedge ratio to protect gross margin. Maintain 50% forecast hedging for supply chain flexibility.',
      resolution: 'HedgeCore identifies MXN 93.7M net confirmed AP across 4 buckets. Generates NDF ladder: Mar MXN 28.8M, Apr MXN 24.5M, May MXN 25.4M, Jun MXN 15.0M. Forward cost MXN 622K. Gross margin variance reduced from 8.1% to 1.2%.',
    },
  },
  {
    id: '2026_EXPORTER_HEAVY_AR',
    label: 'Exporter Heavy AR',
    trades: F03_TRADES, hedges: F03_HEDGES, market: DEFAULT_DEMO_MARKET,
    policy: { bucket_mode: 'CALENDAR_MONTH', hedge_ratios: { confirmed: 1.0, forecast: 0.75 }, cost_assumptions: { spread_bps: 4.0 }, execution_product: 'FWD', min_trade_size_usd: 100_000 },
    presetId: 'active-risk-management',
    demoStory: {
      companyName: 'MexExport Global',
      industry: 'Export-Driven Manufacturing',
      geographicExposure: 'Primary revenue from USD-based export contracts settled in MXN — auto parts, aerospace, agricultural, textiles. Strong AR concentration (78%) with limited AP offset.',
      problem: 'Export receivables create long MXN position. Revenue recognised at prevailing spot rate on settlement — MXN depreciation directly erodes USD-equivalent revenue. Multi-month lead times require early hedging decisions.',
      riskDescription: 'MXN 116.2M confirmed AR vs MXN 11.3M confirmed AP. Net long MXN 104.9M. A 10% MXN depreciation vs USD reduces USD-equivalent revenue by ~USD 552K on confirmed receivables alone.',
      financialImpactWithoutHedge: 'Revenue at risk: USD 552K per 10% MXN depreciation. Annualised: USD 2.2M potential revenue reduction from FX alone. EBITDA guidance and investor-facing metrics unreliable without hedge programme.',
      objective: 'Implement proactive forward hedging: 100% confirmed AR, 75% forecast. Use FWD contracts to lock in revenue certainty and maximise budget rate predictability for financial planning.',
      resolution: 'HedgeCore generates 4-bucket FWD ladder covering MXN 104.9M confirmed net AR. Forward points earn MXN 182K (positive carry). IFRS 9.6.4.1 effectiveness: 98.7% across all buckets. Revenue variance locked within 0.5% of plan.',
    },
  },
  {
    id: '2026_VOLATILE_MARKET',
    label: 'Volatile MXN — Stress',
    trades: F01_TRADES, hedges: F01_HEDGES, market: F04_MARKET,
    policy: { bucket_mode: 'CALENDAR_MONTH', hedge_ratios: { confirmed: 1.0, forecast: 0.80 }, cost_assumptions: { spread_bps: 10.0 }, execution_product: 'NDF', min_trade_size_usd: 50_000 },
    presetId: 'conservative-treasury',
    demoStory: {
      companyName: 'LatAm Corp (Stress Scenario)',
      industry: 'Manufacturing',
      geographicExposure: 'Same mixed AP/AR profile as Balanced Corporate — but market has entered an acute stress episode: MXN has depreciated 12.8% to 21.40, forward curve in extreme contango (+71 bps/month).',
      problem: 'Forward curve is pricing continued MXN weakness at 71 bps per month (vs 45 bps in base case). Hedging is now materially more expensive — but the cost of NOT hedging has simultaneously increased. Decision paralysis is itself a risk.',
      riskDescription: 'Spot 21.40 vs 18.97 base = 12.8% MXN depreciation already embedded. Forward premium at 6-month: +355 bps. Hedge cost nearly 2× normal. Unhedged residual risk remains at full spot volatility (~18% realised vol).',
      financialImpactWithoutHedge: 'Each 5% further MXN depreciation = MXN 4.8M additional cost on confirmed AP. With current carry, 6-month unhedged P&L distribution: −MXN 28M at P5. Hedge despite elevated costs: forward cost (MXN 1.2M) << risk avoided.',
      objective: 'Execute defensive hedging strategy accepting higher forward premiums. Increase forecast hedge ratio to 80%. Accept elevated costs to protect against further tail risk. Full coverage of confirmed exposure non-negotiable.',
      resolution: 'HedgeCore shows hedge cost of MXN 1.18M vs unhedged worst-case of MXN 28M at P5. Cost-benefit ratio: 1:23.7. Engine recommends immediate NDF execution. Generates Mar–Jun ladder at elevated forward rates — cost is insurance, not loss.',
    },
  },
  {
    id: '2026_EUR_GERMAN_MANUFACTURER',
    label: 'EUR — German Subsidiary',
    trades: F05_TRADES, hedges: F05_HEDGES, market: F05_MARKET, policy: F05_POLICY,
    presetId: 'active-risk-management',
    demoStory: {
      companyName: 'BavariaGmbH',
      industry: 'Industrial Machinery & Defence',
      geographicExposure: 'German manufacturer with EUR-invoiced US and EM export contracts. USD-settled raw material imports create EUR/USD mismatch — EUR appreciating vs USD erodes USD-invoiced revenue.',
      problem: 'EUR/USD at 1.0850, negative forward points (−1.2 bps/month) due to Fed/ECB rate differential. EUR appreciation risk: BavariaGmbH has EUR 13.6M gross AR exposure. A EUR 1.09 rate (1.4% move) reduces USD equivalent revenue by ~USD 190K.',
      riskDescription: 'EUR/USD forward points are negative (USD rates > EUR rates), meaning the cost of hedging with forwards is slightly negative carry — actually beneficial to EUR receivers who hedge via FWD. Main risk: EUR appreciation from current 1.0850.',
      financialImpactWithoutHedge: 'EUR 10.5M confirmed net AR. 2% EUR/USD appreciation = USD 210K revenue reduction. Annualised exposure: USD 840K at 2% vol assumption. Defence sector contract margins are thin — 2% FX variance = 25% of contract margin.',
      objective: 'Hedge 85% confirmed, 60% forecast EUR/USD exposure using FWD contracts (negative carry = lower cost). Lock in EUR/USD for all confirmed receivables through Q2 2026. Align hedge documentation with IFRS 9.6.4.1.',
      resolution: 'HedgeCore identifies EUR 10.3M confirmed net receivable. FWD ladder (Mar–Jun): EUR 2.8M Mar, EUR 3.7M Apr, EUR 2.1M May, EUR 1.7M Jun. Negative carry saves EUR 18K vs NDF. Effectiveness: 99.1%. All IFRS 9 criteria met.',
    },
  },
  {
    id: '2026_BRL_AGRO_EXPORT',
    label: 'BRL — Brazil Agro Export',
    trades: F06_TRADES, hedges: F06_HEDGES, market: F06_MARKET, policy: F06_POLICY,
    presetId: 'balanced-corporate',
    demoStory: {
      companyName: 'AgroExport Brasil',
      industry: 'Agricultural Commodities (Soy, Corn, Sugar, Beef)',
      geographicExposure: 'Brazilian agricultural exporter. Revenue in USD, costs in BRL. Commodity prices set in USD globally — BRL depreciation vs USD creates windfall revenue in BRL terms but creates hedging urgency for budget planning.',
      problem: 'SELIC rate at 13.75% creates extremely steep USD/BRL forward curve (+35 bps/month). Hedging is expensive — but the BRL carry regime means significant forward discount to USD. Board has mandated 75% hedge ratio. Timing decisions are high-stakes.',
      riskDescription: 'USD/BRL at 5.045. Forward curve: +354 bps at 6 months = USD 2M additional cost per BRL 100M hedged at 6 months. Net long BRL MXN 193M confirmed AR (soy, beef, corn, iron ore). Carry cost is economically significant vs hedge benefit.',
      financialImpactWithoutHedge: 'BRL 193M confirmed AR. 8% BRL appreciation vs USD → USD revenue erosion of ~USD 3.1M on confirmed book. Unhedged budget variance: 6-10% per quarter in normal conditions. Commodity price correlation with FX amplifies tail risk.',
      objective: 'Hedge 75% confirmed AR via NDF program. Accept high carry cost as insurance against BRL appreciation. Ladder across 4 months to manage SELIC-driven carry efficiently. Generate IFRS 9-ready documentation.',
      resolution: 'HedgeCore generates NDF ladder: Mar BRL 28M, Apr BRL 45M, May BRL 40M, Jun BRL 32M. Total carry cost: BRL 1.8M (vs USD 3.1M downside at 8% appreciation). Cost-benefit ratio: 1:1.7. Hedge efficiency: 98.4%.',
    },
  },
  {
    id: '2026_JPY_ELECTRONICS',
    label: 'JPY — Japan Electronics',
    trades: F07_TRADES, hedges: F07_HEDGES, market: F07_MARKET, policy: F07_POLICY,
    presetId: 'active-risk-management',
    demoStory: {
      companyName: 'NipponTech KK',
      industry: 'Consumer Electronics & Semiconductors',
      geographicExposure: 'Japanese electronics manufacturer exporting to US and EU markets. USD/JPY at 149.80 — historically weak yen elevates JPY-equivalent revenue but creates reversion risk if BOJ normalises policy.',
      problem: 'USD/JPY negative forward points (−0.45 bps/month) — forward market prices JPY strengthening as BOJ policy normalises. At 149.80, a reversion to 140 (−6.5%) would reduce JPY-equivalent revenue by JPY 11.3B on confirmed AR. Budget rate set at 148.',
      riskDescription: 'JPY 1.37T confirmed gross AR vs JPY 235M confirmed AP. Net long JPY 1.14T. Each 5 yen USD/JPY appreciation (JPY strengthens) = JPY 38.2B revenue reduction on confirmed AR. FWD hedges are at negative carry — but JPY appreciation risk is asymmetric given BOJ normalisation trajectory.',
      financialImpactWithoutHedge: 'P5 scenario (BOJ hike to 2%): USD/JPY at 135 = JPY 124.9B revenue reduction on confirmed AR. Annual earnings guidance would miss by 18%. Japanese corporate boards consider >1% FX variance unacceptable in investor guidance.',
      objective: 'Hedge 90% confirmed JPY AR via FWD program. Accept negative carry (forward JPY premium) as cost of certainty. Lock in 148+ budget rate for H1 2026 planning cycle. Generate BOJ-scenario stress outputs.',
      resolution: 'HedgeCore generates FWD ladder: Mar JPY 252B, Apr JPY 365B, May JPY 296B, Jun JPY 161B. Negative carry benefit: JPY 1.08B (positive cash flow from hedging at forward premium). Budget rate locked at 149.35. IFRS 9 hedge documentation: auto-generated.',
    },
  },
  {
    id: '2026_ZAR_MINING',
    label: 'ZAR — SA Mining Company',
    trades: F08_TRADES, hedges: F08_HEDGES, market: F08_MARKET, policy: F08_POLICY,
    presetId: 'balanced-corporate',
    demoStory: {
      companyName: 'AurusMining SA',
      industry: 'Precious & Platinum Group Metals Mining',
      geographicExposure: 'South African mining company — gold, platinum, palladium, diamonds exported in USD, settled in ZAR. SARB rate differential creates steep forward curve (60 bps/month). Commodity price volatility compounds FX risk.',
      problem: 'USD/ZAR at 18.35 with 60 bps/month forward carry. ZAR has depreciated 18% YTD due to load-shedding, political uncertainty, and global EM sell-off. SARB is unlikely to cut rates — forward curve will remain steep. Each delay in hedging costs 60 bps/month in forward rate deterioration.',
      riskDescription: 'ZAR 305M confirmed AR (gold, platinum, palladium). 10% ZAR appreciation vs USD = ZAR 30.5M revenue reduction. Eskom blackouts create production uncertainty, making forecast AR unreliable. Only confirmed AR can be hedged with confidence.',
      financialImpactWithoutHedge: 'Worst-case 20% ZAR appreciation scenario (political resolution): ZAR 61M revenue reduction on confirmed AR. Mine operating costs are ZAR-denominated and fixed — revenue decline directly hits EBITDA. International debt service in USD creates additional FX pressure.',
      objective: 'Hedge 70% confirmed AR using NDF program (illiquid ZAR market requires NDF). Accept high carry cost (60 bps/month). Minimize forecast hedging (40%) given production uncertainty. Prioritise gold and platinum tranches first.',
      resolution: 'HedgeCore generates NDF ladder: ZAR 60.6M Mar, ZAR 53.2M Apr, ZAR 74.9M May, ZAR 25.0M Jun. Total carry cost ZAR 3.2M vs unhedged ZAR 61M worst-case. Engine flags: forward curve premium should be locked immediately — 1-week delay costs ZAR 155K in forward rate deterioration.',
    },
  },
  {
    id: '2026_MULTI_CURRENCY_TREASURY',
    label: 'Multi-Currency Treasury',
    trades: F09_TRADES, hedges: F09_HEDGES, market: DEFAULT_DEMO_MARKET, policy: F09_POLICY,
    presetId: 'balanced-corporate',
    demoStory: {
      companyName: 'GrupoGlobal SA de CV',
      industry: 'Diversified Conglomerate (Manufacturing · Technology · Real Estate)',
      geographicExposure: 'Mexican holding company with subsidiaries in Germany (EUR), Japan (JPY), Brazil (BRL) and Mexico (MXN). Treasury centre consolidates FX exposures across 4 currencies for centralized hedging.',
      problem: 'Four active currencies (MXN, EUR, JPY, BRL) with different rate environments, carry costs, and liquidity profiles. Natural netting between subsidiaries reduces gross exposure by 23% — but identifying the optimal net position requires a unified treasury view that manual spreadsheets cannot provide.',
      riskDescription: 'MXN exposure: net AP MXN 53.5M. EUR exposure: net AR EUR 2.8M. JPY exposure: net AR JPY 535M. BRL exposure: forecast AR BRL 22M. Without HedgeCore, each subsidiary hedges independently — duplicate positions, excess costs, policy inconsistency across jurisdictions.',
      financialImpactWithoutHedge: 'Decentralised hedging premium vs centralised: estimated 40–60 bps excess cost per trade (double hedging, no netting). Annual cost of decentralised approach: ~USD 480K in excess hedge costs plus 3× the operational burden.',
      objective: 'Centralise multi-currency exposure netting at group treasury level. Identify cross-currency natural hedges. Generate consolidated hedge ladder per currency. Provide a single policy-compliant view across all subsidiaries for the CFO and board.',
      resolution: 'HedgeCore processes 10 cross-currency positions. Identifies MXN natural netting opportunity (MXN 19.5M AR offsets MXN 72M AP → net AP MXN 52.5M). Generates 3 separate hedge ladders (MXN NDF, EUR FWD, JPY FWD). Total estimated cost saving vs independent hedging: USD 312K annually.',
    },
  },
  {
    id: '2026_TRY_CONSTRUCTION',
    label: 'TRY — Turkey Infrastructure',
    trades: F10_TRADES, hedges: F10_HEDGES, market: F10_MARKET, policy: F10_POLICY,
    presetId: 'conservative-treasury',
    demoStory: {
      companyName: 'AnadoluInşaat AŞ',
      industry: 'Construction & Infrastructure',
      geographicExposure: 'Turkish construction company with USD-denominated steel and machinery imports, government contracts indexed to USD, and TRY-settled project revenues. Operating in a high-inflation, high-carry currency regime.',
      problem: 'USD/TRY at 32.85 with extraordinary forward carry: 142 bps/month (6-month forward: 38.20 — a 16.3% forward premium). Hedging costs are economically punishing. But TCMB policy rate at 45% means TRY depreciation is structurally embedded. Every month without a hedge = 142 bps cost compounding.',
      riskDescription: 'TRY 1.45T confirmed AP (imports) vs TRY 505M confirmed AR. Net short TRY 945M. Each 10% TRY depreciation = TRY 94.5M additional import cost. At current TCMB rate of 45%, TRY is expected to depreciate a further 15–20% over 6 months — structural, not episodic.',
      financialImpactWithoutHedge: 'Unhedged: TRY 94.5M per 10% depreciation. 6-month P5 scenario (20% depreciation): TRY 189M loss. Forward curve hedge cost: TRY 159M at full coverage (high but bounded). Paradox of high-carry EM: hedge cost is predictable; unhedged loss is not.',
      objective: 'Hedge 95% confirmed AP exposure to eliminate import cost uncertainty. Accept punishing carry premium (TRY 159M at 6 months) as cost of business certainty. Hedge generates a fixed USD import cost for government contract pricing purposes.',
      resolution: 'HedgeCore calculates: hedge cost TRY 159M vs unhedged P5 loss TRY 189M — hedge is economically optimal even at 45% TCMB rate. Generates NDF ladder: Mar TRY 285B, Apr TRY 275B, May TRY 390B, Jun TRY 145B. Engine recommendation: execute full ladder immediately — each week of delay = TRY 2.1B additional carry cost.',
    },
  },
];

// Keep backward-compatible exports
export const DEFAULT_DEMO_TRADES = F01_TRADES;
export const DEFAULT_DEMO_HEDGES = F01_HEDGES;
