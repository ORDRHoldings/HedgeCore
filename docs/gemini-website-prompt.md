# ORDR Terminal — Complete Website Design & Build Prompt

You are building the complete public-facing marketing website for **ORDR Terminal**, a fintech ecosystem platform. This is a real company at pre-seed stage preparing for investor outreach. The website must look like it belongs to a $50M+ fintech company — not a startup landing page, not a template, not generic SaaS. Think Bloomberg Terminal meets Stripe's marketing site.

---

## COMPANY IDENTITY

- **Name**: ORDR Terminal (stylized as "ORDR" in logo, always uppercase)
- **Tagline**: "The Fintech Ecosystem"
- **Positioning**: Deterministic Computation + Agentic Intelligence
- **Headquarters**: Newport Beach, CA, USA
- **Email**: info@ordrterminal.com
- **Stage**: Pre-seed, live platform with demo access
- **Target**: Enterprise treasury teams, midsize corporates, professional/retail traders
- **Domain**: Will be ordrterminal.com (currently on Vercel preview)

---

## DESIGN SYSTEM — BLOOMBERG-INSPIRED INSTITUTIONAL

### Color Palette
```
Navigation:     #000000 (solid black bar)
Background:     #FFFFFF (primary white)
Background Alt: #F7F8FA (section alternation)
Background Muted: #EEEEF2 (subtle fills)
Background Dark: #0C0C0C (footer, dark sections)

Text Primary:   #111111
Text Secondary: #555555
Text Muted:     #999999
Text on Dark:   #FFFFFF

Accent:         #1E3A5F (deep navy — primary brand color)
Accent Hover:   #162D4A
Accent Light:   rgba(30,58,95,0.04) (icon backgrounds)

Border:         #E5E7EB
Border Light:   #F0F0F0

Green (status): #059669
Amber (warning): #D97706
Red (error):    #DC2626
```

### Typography
```
Headings:  Manrope (weight 700-800, tight letter-spacing -0.03em)
UI/Body:   IBM Plex Sans (weight 400-600)
Mono/Data: IBM Plex Mono (weight 500-700, letter-spacing 0.06-0.15em)
```

### Design Rules
- **NO gradients** on backgrounds. Flat, clean sections with subtle borders.
- **NO rounded corners > 8px**. Sharp, institutional look.
- **Minimum font size: 12px** everywhere (institutional standard).
- **Section alternation**: White (#FFFFFF) and light gray (#F7F8FA) sections, separated by 1px #E5E7EB borders.
- **Inline SVG diagrams** for architecture/flow visualizations — not images, not illustrations.
- **No stock photos**. No generic illustrations. Data-dense, text-heavy, information-rich.
- **Stats in IBM Plex Mono** with large weight (800) and accent color.
- **Section labels** in monospace, uppercase, letter-spaced (0.15em), muted color, above headings.
- **Card style**: 1px border (#E5E7EB), 8px radius, 24-28px padding, no heavy shadows.

---

## NAVIGATION (Fixed, 56px height)

**Left**: ORDR logo (IBM Plex Mono, 18px, 800 weight, white, letter-spacing 0.06em)

**Center (Desktop)**:
- "Products" dropdown → 7 products in 2-column grid (480px wide), each with icon + name + one-line desc
- "Solutions" dropdown → 6 solutions in single column (380px wide)
- "ORDR Market" link → https://ordr-market.vercel.app/ (external)
- "About" → /about
- "Contact" → /contact

**Right**:
- "Sign In" text link → /auth/login
- "Request Demo" white button → /contact

**Mobile**: Hamburger → full-screen overlay with all nav items + CTAs

---

## PAGE 1: LANDING PAGE (/)

### Section 1: Hero
- Label: "THE FINTECH ECOSYSTEM" (monospace, uppercase, muted)
- Headline: **"Deterministic Computation. Agentic Intelligence."** (56px, 800 weight)
  - "Agentic Intelligence." in accent navy color
- Subtitle: "Seven products for enterprise, midsize, and retail. Treasury hedge governance, agentic charting, portfolio risk, scenario simulation, geopolitical intelligence, and knowledge navigation -- all on one deterministic platform."
- Secondary text (smaller, muted): "Engines are deterministic -- same input, same output, always. AI provides communication, chart analysis, and intelligence where present. It never touches calculations."
- CTA buttons:
  - Primary: "Request Demo →" (navy bg, white text) → /contact
  - Secondary: "Explore Products" (outlined) → /products
- Below CTAs: Green dot + "LIVE PLATFORM — REQUEST ACCESS FOR GUIDED DEMO" (monospace, small)
- Padding: 100px top, 80px bottom

### Section 2: Stats Strip (alt background with top/bottom borders)
| 7 | 3 | 41 | <50ms | SHA-256 |
|---|---|---|---|---|
| Products | Market Tiers | Engine Modules | Computation | Audit Chain |

Stats in monospace, large (28px, 800 weight, accent color). Labels in small caps below.

### Section 3: Platform Architecture (SVG Diagram)
- Label: "ARCHITECTURE"
- Heading: "The ORDR Platform Architecture"
- Subtitle: "Three layers, one principle: deterministic computation with intelligent assistance. The engine never guesses. The AI never executes."
- **Large SVG diagram (940×560)** showing 3 horizontal layers:
  1. **User Interface Layer** (top, white bg) — boxes for: Terminal, Charts, Voice, Chatbox, Reports
  2. **Agentic AI Layer** (middle, teal/green #1a6b5a) — Customer Management, Report Generation, Chart Analysis, Trading Coaching, Geopolitical Intel. Sub-labels: "Voice & Chat Interface", "Communication Layer", "Never Auto-Executes"
  3. **Deterministic Engine Layer** (bottom, navy #1E3A5F) — kernel.py, validator.py, audit.py, 41 modules, SHA-256 chain, WORM. Sub-labels: "Sub-50ms latency", "Same input = Same output, always", "Tamper-evident audit trail"
  - Dashed arrows between layers labeled "QUERIES" / "INSIGHTS" / "COMPUTE" / "RESULTS"

### Section 4: Product Interface Showcase (alt background)
- Label: "INTERFACE"
- Heading: "Built for professionals. Used by institutions."
- 3 dark terminal-style cards (#0B1120 bg) in a row:
  1. **Treasury Terminal** — "Hedge calculation output with hash envelope, policy governance, execution pipeline"
     - Bullets: Deterministic kernel output, SHA-256 hash envelope, 4-eyes execution gate, WORM audit log
  2. **ORDR Market** — "60fps Canvas 2D charting engine with AI-coached algo trading"
     - Bullets: 77+ indicators, Multi-language algo builder, Real-time data feeds, AI discipline coaching
  3. **Portfolio Risk** — "R1-R8 risk taxonomy with exposure decomposition"
     - Bullets: 8 risk categories, Concentration analysis (HHI), Multi-entity netting, Hedge plan generation
  - Each bullet has a green dot indicator

### Section 5: Tamper-Evident Audit Trail (WORM) — still in alt background
- Label: "AUDIT INFRASTRUCTURE"
- Heading: "Tamper-Evident Hash Chain"
- Subtitle: "Every calculation, decision, and approval is permanently recorded in an append-only, cryptographically sealed audit trail. No UPDATE, no DELETE -- ever."
- **SVG hash chain visualization** (900×200): 5 blocks connected by arrows
  - Block 0 (dark): GENESIS — hash "0000...0000", tenant_001, IMMUTABLE
  - Blocks 1-4 (light): "Calc Run #1", "Policy Rev", "Approval", "Execution" — each with SHA-256 hash snippet, WORM/APPEND/SEALED/LOCKED labels, IMMUTABLE badge
- Below SVG: 4 anchor stats in a row:
  - WORM Storage — "Write Once, Read Many"
  - SHA-256 — "Per-tenant hash chain"
  - Zero Deletion — "No UPDATE, no DELETE"
  - Regulation-Ready — "IFRS 9 / ASC 815 aligned"

### Section 6: Products Grid (white bg)
- Label: "PRODUCTS"
- Heading: "Seven products. One ecosystem."
- Subtitle: "Enterprise treasury governance, professional trading tools, and retail-friendly charting -- each product powered by the same deterministic computation engine."
- **3-column grid** of 7 product cards (last one centered):

| Product | Description | AI Note |
|---------|-------------|---------|
| ORDR Treasury | Deterministic FX hedge calculation with 60 policy presets, 41 engine modules, 4-eyes governance, and WORM audit trail. | AI serves as communication layer -- chat, phone, voice. AI does not evaluate calculations. |
| ORDR Market | The first Agentic charting system with AI integrated. Built for algorithmic trading. Python, JavaScript, natural language. | AI coaches trading discipline, reads charts, provides insight. Not a signal service. |
| ORDR Portfolio | Multi-currency portfolio risk decomposition with deterministic R1-R8 risk taxonomy, concentration monitoring. | AI assists with customer management and institutional reports. All calculations deterministic. |
| ORDR Labs | Pure deterministic scenario studio with backtesting, Monte Carlo simulation, historical VaR/ES, crisis replay. | No AI involvement. Full sandbox isolation with frozen kernel. |
| ORDR Polisophic | Geopolitical risk intelligence powered by AI corridor scoring. 190+ countries monitored. | AI synthesizes risk signals into hedging recommendations. |
| ORDR HedgeWiki | AI-searchable ISDA definitions, IFRS 9 / ASC 815 reference library. Natural language queries. | AI navigates knowledge graph with citation-backed answers. |
| ORDR FinHub | AI-curated economic calendars, company research, signal detection. Macro data aggregation. | AI filters noise, prioritizes events relevant to portfolio. |

Each card has: Icon (top-left), product name (monospace, bold), description, "Learn More →" link in accent color.

### Section 7: How the AI Layer Works (white bg)
- Label: "INTELLIGENCE"
- Heading: "How the AI Layer Works"
- **4-column grid** of numbered cards (01-04):
  1. **Engine Calculates** — "The deterministic engine processes inputs through 41 production modules. Same input always produces the same output. Sub-50ms. Hash-chained. Reproducible."
  2. **AI Communicates** — "AI is a communication and management layer for specific products. Treasury uses chat, voice, phone. Market uses AI for chart analysis. Polisophic for geopolitical intelligence. AI does not evaluate engine calculations."
  3. **AI Assists** — "Where AI is present, it assists through communication channels: status updates, report writing, chart reading, algo building, geopolitical analysis. AI is not involved in any calculation."
  4. **Human Decides** — "AI never auto-executes. Every trade, hedge, and decision is made by the human operator. 4-eyes governance and separation of duties on all execution."

### Section 8: Solutions Grid (alt bg)
- Label: "SOLUTIONS"
- Heading: "Built for your industry"
- **3-column grid** of 6 solution cards:
  1. Corporate Treasury — End-to-end FX risk management for corporate treasury operations
  2. Risk Management — Enterprise risk quantification, monitoring, and governance
  3. Asset Management — Multi-currency portfolio hedging and exposure analysis
  4. Banking & Capital Markets — Institutional FX infrastructure for banks and dealers
  5. Insurance — ALM currency risk and regulatory hedge accounting
  6. Energy & Commodities — Commodity-linked FX exposure and cross-currency hedging

### Section 9: Architecture Detail (white bg)
- Label: "INFRASTRUCTURE"
- Heading: "The ORDR Architecture"
- **SVG diagram (900×300)** with 5 vertical pillars side-by-side:
  1. **WORM AUDIT** (navy) — SHA-256 hash chain, Append-only logs, Per-tenant chains, GENESIS_HASH, Tamper-evident, No UPDATE, No DELETE
  2. **4-EYES GOV** (teal) — Maker-checker, Separation of duties, Tri-state pipeline, 9 RBAC roles, 41 permissions, Threshold-based, 3-actor SoD
  3. **DET. ENGINE** (navy) — 41 modules, Sub-50ms latency, Pure functions, No side effects, Hash-chained, Reproducible, Verifiable
  4. **AI INSIGHT** (teal) — Customer management, Report writing, Chart analysis, Status updates, Voice & chat, Market & Polisophic, Never executes
  5. **MULTI-CH** (navy) — Voice (WebRTC), Chat (NL), Terminal UI, REST API, Reports, 219+ endpoints, Mobile-ready

### Section 10: Workflow (alt bg)
- Label: "WORKFLOW"
- Heading: "Five steps. Full governance. AI-assisted."
- **5-column grid** of step cards (01-05):
  1. **Import Exposures** — Upload FX positions from ERP, TMS, or spreadsheet. Automatic classification, validation, enrichment.
  2. **Configure Policy** — Select from 60 presets or build custom. Hedge ratios, instruments, governance tiers, risk parameters.
  3. **Calculate** — Deterministic engine computes. Sub-50ms, reproducible, auditable. Every calculation hash-chained.
  4. **Review & Report** — Review engine outputs. AI helps communicate status and write reports. AI does not evaluate calculations.
  5. **Execute** — 4-eyes approval, governed execution, WORM audit trail. Every decision recorded, hash-chained, immutable.

### Section 11: Platform Capabilities (white bg)
- Label: "PLATFORM"
- Heading: "Built to institutional standards"
- **3-column grid** of 6 capability cards:
  1. **WORM Audit Trail** — Append-only event log with SHA-256 hash chain. Per-tenant chains with GENESIS_HASH verification.
  2. **4-Eyes Governance** — Maker-checker with SoD. Tri-state pipeline. Threshold-based escalation with 3-actor SoD.
  3. **Deterministic Engine** — 41 modules, sub-50ms. Pure functions, no side effects, no randomness. Independently verifiable.
  4. **IFRS 9 / ASC 815** — Prospective effectiveness testing, critical terms matching, dual-standard support, evidence grading.
  5. **Real-Time Risk Intelligence** — R1-R8 taxonomy, exposure decomposition, concentration analysis, scenario stress testing.
  6. **Policy Engine** — 60 presets, 7-layer extension architecture, volatility overlays, geopolitical risk, netting.

### Section 12: CTA (navy accent bg, full-width)
- Label: "ENTERPRISE-GRADE" (white, muted)
- Heading: "See the platform in action" (white, 40px)
- Subtitle: "Request a guided demo with live data. Enterprise treasury teams, professional traders, and risk managers -- experience the full ecosystem."
- Buttons:
  - "Request Demo →" (white bg, navy text) → /contact
  - "Sign In" (transparent, white border) → /auth/login

---

## PAGE 2: PRODUCTS INDEX (/products)

### Hero
- Label: "ORDR TERMINAL PLATFORM"
- Heading: "Seven Products. One Ecosystem."
- Subtitle: "Enterprise treasury governance, professional trading tools, and retail-friendly charting -- all on one deterministic platform. AI is not used in calculations."

### Platform Architecture SVG (same 4-layer diagram as landing page but simpler version, 900×420)

### Product Suite Grid
Same 7 products as landing page but in 2-column layout with full descriptions.

### Deterministic Core + AI Layer Section
3-column explanation:
1. **Deterministic Engine** — 41 modules, hash-chained, sub-50ms, no randomness
2. **AI Communication Layer** — Communication and management only, never touches calculations
3. **Governance Boundary** — Strict architectural separation, read-only AI access, 4-eyes on all mutations

### Trust Strip (4 items in a row)
- WORM Audit Trail
- 4-Eyes Governance
- Sub-50ms Engine
- Multi-Channel AI

### CTA: "See the ecosystem in action" → Request Demo

---

## PAGE 3: ORDR TREASURY (/products/treasury)

### Hero
- Back link: "← All Products"
- Heading: "ORDR Treasury"
- Subtitle: "Deterministic FX Hedge Governance with Agentic Communication"
- Description: Deterministic hedge calculation with 60 policy presets. AI is a communication layer only -- chat, phone, voice. AI does not evaluate or influence any calculations.
- CTA: "Get Started →" → /auth/login

### Stats: 60 Policy Presets | 8 Risk Categories | <50ms Computation | SHA-256 Hash Chain | 41 Engine Modules | 4-Eyes Governance

### AI Communication Assistant (3-column grid)
1. **Terminal Chat** — "What is my largest EUR/USD exposure?" Status summaries, report drafting, counterparty analysis.
2. **Phone / Voice** — Verbal status updates, quick portfolio summaries, hands-free operation.
3. **Report Writing** — Board presentations, regulatory submissions, stakeholder summaries.
- Disclaimer: "The AI is a communication and management layer. It does not evaluate, influence, or modify any calculation output from the deterministic engine."

### Architecture SVG (3-column flow)
USER → AGENTIC AI (Communication) → DETERMINISTIC ENGINE
With "READ ONLY" label on AI-to-Engine connection

### Workflow (6 steps)
Position Intake → Policy Assignment → Deterministic Calculation → Communication & Reports → Governance Review → Execution & Audit

### Capabilities (8 feature cards in 2-column grid)
1. Policy Engine (60 presets, 50+ config fields)
2. 4-Eyes Governance (tri-state, maker-checker, SoD)
3. WORM Audit Trail (append-only, SHA-256, per-tenant)
4. IFRS 9 / ASC 815 Effectiveness (critical terms, statistical forecast)
5. R1-R8 Risk Taxonomy (8 frozen categories)
6. Scenario Stress Testing (vol-scaled, crisis replay, VaR/ES)
7. Geopolitical Overlay (Polisophic corridor scoring)
8. Deterministic Execution (41-module kernel, pure functions)

### CTA: "Get Started" → /auth/login

---

## PAGE 4: ORDR MARKET (/products/market)

### Hero
- Heading: "ORDR Market"
- Subtitle: "The First Agentic Charting Platform"
- Description: AI-integrated charting for algorithmic trading. Python, JavaScript, natural language. AI coaches discipline -- not signals.
- CTA: "Open ORDR Market →" → https://ordr-market.vercel.app/ (external link, new tab)

### Stats: 77+ Indicators | 60fps Rendering | Canvas 2D Engine | 5 Asset Classes | Multi-Lang Algo Builder | AI-Coach Discipline

### Agentic AI for Trading (3-column grid)
1. **Chart Reading Assistance** — Structure analysis, support/resistance, trend formations. Does NOT predict.
2. **Discipline Coaching** — Plan adherence, rule violation flags, session scorecards.
3. **Strategy Building** — Natural language → executable code. Python, JavaScript. Risk controls auto-added.

### Trading Flow Architecture SVG
MARKET DATA → AI ANALYSIS → STRATEGY BUILDER (Python/JS/NL) → EXECUTION → YOUR BROKER

### Build Algorithms Section (alt bg, 3-column grid)
Each with language name, description, and dark code block:
- **Python**: `def strategy(candles): sma20 = candles.close.rolling(20).mean()...`
- **JavaScript**: `function strategy(candles) { const sma = SMA(candles.close, 20)...`
- **Natural Language**: `"Buy when price crosses above the 20-period moving average..."`

### Capabilities (8 feature cards)
Canvas 2D Engine, 77+ Indicators, Multi-Asset Coverage, Algorithm Builder, Drawing Tools, Real-Time Data, Execution Linking, 6-Tab Intelligence

### Disclaimer Banner
"This is not a signal service. ORDR Market does not generate buy/sell signals, predict price movements, or guarantee returns. It coaches discipline, assists chart reading, and helps build strategies."

### CTA: "Open ORDR Market" → https://ordr-market.vercel.app/

---

## PAGE 5: ORDR PORTFOLIO (/products/portfolio)

### Hero
- Heading: "ORDR Portfolio"
- Subtitle: "Deterministic Portfolio Risk Decomposition with Institutional Reporting"
- CTA: "Request Demo →" → /contact

### Stats: 8 Risk Categories | 100+ Currency Pairs | <50ms Computation | WORM Audit Trail | R1-R8 Taxonomy

### Risk Decomposition Flow SVG
PORTFOLIO → R1-R8 CLASSIFICATION (8 category blocks) → REPORT ENGINE → RISK REPORT

### R1-R8 Risk Taxonomy (2-column grid, 8 items, each with accent left border)
- R1 Translation, R2 Transaction, R3 Economic, R4 Strategic, R5 Operational, R6 Settlement, R7 Credit, R8 Liquidity

### Capabilities (6 feature cards)
Exposure Decomposition, Hedge Plan Generation, Multi-Entity Consolidation, Concentration Analysis, Scenario Stress Testing, Institutional Reporting

---

## PAGE 6: ORDR LABS (/products/labs)

### Hero
- Heading: "ORDR Labs"
- Subtitle: "Scenario Studio, Backtesting, and Monte Carlo Simulation"
- Description: Full sandbox isolation. Same deterministic engine as production. **No AI involvement.**
- CTA: "Request Demo →" → /contact

### Stats: 50+ Scenarios | 10,000+ Monte Carlo Paths | SHA-256 Report Integrity | Full Sandbox Isolation | Multi-Period Backtesting

### Sandbox Architecture SVG
Dashed sandbox boundary containing: Scenario Studio, Monte Carlo, Backtesting, What-If Analysis → DETERMINISTIC ENGINE → OUTPUT/REPORTS

### Capabilities (8 feature cards)
Scenario Studio, Sandbox Environment, Crisis Library (2008 GFC, 2015 CHF, 2016 Brexit, 2020 COVID, 2022 rates, EM crises), What-If Analysis, Backtesting Engine, Monte Carlo Simulation, Sensitivity Analysis, Report Integrity

---

## PAGE 7: ORDR POLISOPHIC (/products/polisophic)

### Hero
- Heading: "ORDR Polisophic"
- Subtitle: "AI-Powered Geopolitical Intelligence for FX Risk"
- CTA: "Request Demo →" → /contact

### Capabilities: Corridor Scoring, Real-Time Monitoring, Risk Decomposition, Country Profiles, Overlay Integration, Historical Analysis, Alert System, Cross-Reference Engine

---

## PAGE 8: ORDR HEDGEWIKI (/products/hedgewiki)

### Hero
- Heading: "ORDR HedgeWiki"
- Subtitle: "AI-Enhanced Institutional Knowledge Base"
- CTA: "Open HedgeWiki →" → https://hedge-wiki.vercel.app/ (external, new tab)

### Stats: 1,000+ Entries | 6 Standards | Full-Text Search | AI-Enhanced Navigation | Citation Backed

### Knowledge Graph SVG
Central AI SEARCH node connected to 6 knowledge domains: ISDA, IFRS 9, ASC 815, Regulatory, Methodology, Best Practice

### Ask the Knowledge Base (4 Q&A examples with accent left border)
Example questions about IFRS 9 effectiveness, ISDA definitions, ASC 815 comparisons, EMIR reporting

### Capabilities (8 feature cards)
ISDA Definitions, IFRS 9 Guide, ASC 815 Guide, Regulatory Library, Best Practices, Semantic Search, Methodology Library, Cross-Reference Engine

---

## PAGE 9: ORDR FINHUB (/products/finhub)

### Hero
- Heading: "ORDR FinHub"
- Subtitle: "AI-Curated Market Intelligence"
- CTA: "Request Demo →" → /contact

### Stats: 6 Intelligence Tabs | Real-Time Data Feed | 5 Asset Classes | AI-Curated Signal Detection | Global Coverage

### Data Flow SVG
DATA SOURCES → AI CURATION (Relevance Scoring, Noise Reduction, Context Addition) → 6 INTEL TABS → TREASURY TEAM

### Capabilities
Market Intelligence Dashboard, Economic Calendar, Company Research, Custom Watchlists, AI Signal Detection, Curated News, AI Noise Reduction, Contextual Alerts

---

## PAGE 10: ABOUT (/about)

### Mission
"Institutional-Grade Financial Infrastructure"
- Deterministic engine: identical results for identical inputs, no ML black boxes
- Agentic AI layer for insight, evaluation, assistance
- AI never auto-executes; every decision with human operator

### Core Values (4 cards)
1. **Determinism** — Same inputs → identical outputs. 41 modules, sub-50ms, reproducible
2. **Transparency** — Full audit trail. SHA-256 hash-chained, complete provenance
3. **Governance** — 4-eyes, SoD, 41 permissions, 9 roles, tri-state pipeline
4. **Simplicity** — Complex problems, clear interfaces. AI in plain language

### Architecture SVG (3-layer horizontal diagram)
UI → AI → Engine with labeled arrows

### Industries Served (6 items in 3x2 grid)
Corporate Treasury, Banking & Capital Markets, Asset Management, Insurance, Energy & Commodities, Sovereign & Public Sector

### Platform Numbers (stats strip)
41 Engine Modules | 219+ API Endpoints | <50ms Latency | 7 Product Suite | 60 Policy Presets

---

## PAGE 11: CONTACT (/contact)

### Layout: 60/40 split

**Left (60%): Contact Form**
- Fields: Name, Email, Company, Role (dropdown), Message
- Role options: VP Treasury, Treasury Analyst, CRO, VP Risk, Portfolio Manager, Head of FX, Compliance, CTO, Other
- Submit: "Send Message →"
- Success state: Checkmark + "Thank you" message

**Right (40%): Contact Cards**
4 stacked cards:
1. General Inquiries: info@ordrterminal.com
2. Sales: sales@ordrterminal.com
3. Support: support@ordrterminal.com
4. Headquarters: Newport Beach, CA, USA

---

## PAGE 12: LOGIN (/auth/login) — DARK THEME

This page is completely different from the marketing site. It uses a dark enterprise terminal aesthetic.

### Design
- **Background**: #0B1120 (very dark blue-black)
- **Card**: 380px wide, 40px/36px padding, semi-transparent panel with backdrop blur
- **Accent**: #111111 (black, not blue)
- **Particle field**: Subtle dark particle canvas behind the card with connection lines
- **Parallax**: Card tilts slightly on mouse movement
- **Corner telemetry** (ambient decoration, fixed position):
  - Top-left: "SYS_LOAD: φ=1.618 / NODE_SYNC: TRUE"
  - Top-right: "CLOCK_PI: 3.1415... / LOC: [0.00, 0.00]"
  - Bottom-left: "SEC_LEVEL: QUANTUM / ENC: AES-256"
  - Bottom-right: "ORDR_OS v4.0 / HANDSHAKE: WAIT"

### Card Content
1. **Logo**: ORDR horizontal logo (white, inverted)
2. **Context header**: "Institutional FX Hedge Governance" (monospace, uppercase, small)
3. **Subtitle**: "Authenticate to access deterministic hedge calculations, policy governance, and the execution pipeline."
4. **Terminal ID** field (monospace input, underline-only border, center-aligned)
5. **Access Key** field (password with show/hide toggle, caps lock warning)
6. **Submit button**: "ESTABLISH LINK" (uppercase, letter-spaced 0.3em, light gray #E5E7EB bg, dark text)
7. **Security badges**: AES-256 | HASH-CHAINED AUDIT | RBAC | 4-EYES APPROVAL (bordered pills)
8. **Footer**: "© 2026 SYNEXIUN" left, green dot + "ENCRYPTION ACTIVE" right

### Animations
- Entrance: Overlay fades out after 1.8s
- Card: Scales from 0.6 → 1.0 with blur-to-clear (bloom effect)
- Input focus: 6px translateX shift
- Button hover: Letter-spacing expands from 0.3em → 0.45em
- Loading: Spinning icon + "AUTHENTICATING..."

### Error States
- Auth error: Red left-border bar, "⊘ ACCESS DENIED"
- Rate limit: Amber bar, "⊘ RATE LIMITED"
- Server warmup: Amber bar, "◷ SERVER INITIALIZING"
- MFA: Secondary screen with 6-digit code input

---

## PAGE 13-18: SOLUTION PAGES (/solutions/*)

Six solution pages, each following the same template:

### Template Structure
1. **Hero**: Industry icon + heading + subtitle + "Request Demo" CTA
2. **Stats strip**: 5 industry-relevant metrics
3. **Challenge section**: Industry-specific FX risk challenges
4. **Architecture/Workflow SVG**: Industry-adapted flow diagram
5. **Capabilities grid**: 6-8 feature cards customized per industry
6. **Compliance section**: Industry-specific regulatory references
7. **CTA**: "Request Demo" → /contact

### Solution Details

**Corporate Treasury** (/solutions/corporate-treasury)
- Challenges: Multi-subsidiary exposure, intercompany netting, board reporting, hedge effectiveness
- Key features: Multi-entity consolidation, policy governance, IFRS 9/ASC 815 compliance

**Risk Management** (/solutions/risk-management)
- Challenges: Enterprise risk quantification, scenario analysis, stress testing, regulatory reporting
- Key features: R1-R8 taxonomy, VaR/ES, Monte Carlo, concentration monitoring

**Asset Management** (/solutions/asset-management)
- Challenges: Multi-currency hedging, benchmark tracking, factor attribution, reporting
- Key features: Portfolio decomposition, hedge plan optimization, exposure analysis

**Banking & Capital Markets** (/solutions/banking)
- Challenges: Institutional FX infrastructure, dealer operations, settlement risk, compliance
- Key features: High-throughput engine, counterparty exposure, regulatory reporting

**Insurance** (/solutions/insurance)
- Challenges: ALM currency risk, Solvency II, IFRS 17 transition, long-dated hedges
- Key features: Duration-matched hedging, regulatory compliance, actuarial integration

**Energy & Commodities** (/solutions/energy)
- Challenges: Commodity-linked FX, cross-currency basis, volatile EM exposures, EMIR reporting
- Key features: Multi-commodity FX overlay, basis risk management, EM currency coverage

---

## FOOTER (all pages)

**Dark background (#0C0C0C), 5-column grid**

| Brand (1.4fr) | Products (1fr) | Solutions (1fr) | Company (1fr) | Legal (1fr) |
|---|---|---|---|---|
| ORDR logo | ORDR Treasury | Corporate Treasury | About | Privacy Policy |
| "The fintech ecosystem for enterprise, midsize, and retail. Deterministic computation, agentic intelligence, tamper-evident audit." | ORDR Market | Risk Management | Contact | Terms of Service |
| | ORDR Portfolio | Asset Management | Careers | Security |
| | ORDR Labs | Banking & Capital Markets | | |
| | ORDR Polisophic | Insurance | | |
| | ORDR HedgeWiki | Energy & Commodities | | |
| | ORDR FinHub | | | |

**Bottom bar**: © 2026 ORDR Terminal. All rights reserved. | info@ordrterminal.com

---

## RESPONSIVE BREAKPOINTS

- **> 900px**: Full desktop layout
- **768-900px**: 2-column grids collapse to 2 or 1, workflow grid to 2-column
- **< 768px**: All grids single-column, mobile nav overlay, stats strip wraps
- **< 480px**: Tighter padding, AI layer grid single-column

---

## CRITICAL MESSAGING RULES

1. **"Deterministic Computation + Agentic Intelligence"** — This is the core tagline. Engine and AI are architecturally separated.
2. **AI NEVER touches calculations** in ANY product. AI is used ONLY for:
   - Treasury: Communication (chat, voice, phone), report writing, customer management
   - Market: Chart analysis, discipline coaching, algo building (this IS the core AI product)
   - Polisophic: Geopolitical intelligence (this IS the core AI product)
   - HedgeWiki: Knowledge graph navigation
   - FinHub: Market intelligence curation
   - Portfolio: Report writing, customer management
   - Labs: ZERO AI — pure deterministic
3. **"Not a signal service"** — ORDR Market does NOT predict prices or generate buy/sell signals
4. **"AI never auto-executes"** — Human decides, always. 4-eyes governance.
5. **"Same input = Same output"** — Determinism is the #1 selling point
6. **Enterprise + Midsize + Retail** — Not just institutional. The ecosystem serves all tiers.
7. **WORM = Write Once Read Many** — Append-only audit logs. SHA-256 hash chain per tenant.

---

## IMPLEMENTATION NOTES

- Build as a multi-page static site (HTML/CSS/JS or React/Next.js)
- All SVG diagrams should be inline, not external images
- Every section should have generous padding (80px vertical minimum)
- Cards should not have heavy box shadows — subtle 1px borders only
- The overall feel should be: **dense, informational, credible, institutional**
- Think Bloomberg Terminal landing page + Stripe documentation quality
- No generic startup aesthetics (no floating circles, no isometric illustrations, no gradient meshes)
- Data-dense is good. Text-heavy is good. This is B2B fintech, not B2C.
- Every product page follows the same template: Hero → Stats → Diagram → Features → CTA
- Mobile responsive but desktop-first — institutional buyers are on desktop

---

## DELIVERABLE

Build the complete website with all 18+ pages, fully responsive, with:
- All text content as specified above
- All SVG architecture diagrams
- Working navigation with dropdowns
- Contact form (UI only, no backend needed)
- Login page with dark theme and animations
- Consistent design system throughout
- Professional, institutional-grade visual quality

The website should look like it was built by a funded fintech company's design team, not generated by AI.
