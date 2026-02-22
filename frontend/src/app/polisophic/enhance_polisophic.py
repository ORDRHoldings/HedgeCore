"""
Script to add My Exposure Risk tab to polisophic/page.tsx
Run from: D:\Synexiun\1-SynexFund\HedgeCalc\FXDemo\frontend\src\app\polisophic\
"""
import io

content = io.open('page.tsx', 'r', encoding='utf-8').read()

# ─── Step 1: Add useAuth import ───────────────────────────────────────────────
content = content.replace(
    '"use client";\n\nimport { useState } from "react";',
    '"use client";\n\nimport { useState } from "react";\nimport { useAuth } from "../../lib/authContext";'
)

# ─── Step 2: Add My Exposure Risk to tabs array ───────────────────────────────
content = content.replace(
    'const tabs = ["Event Feed", "Risk Scores", "Macro Scenarios", "Alert Rules"];',
    'const tabs = ["Event Feed", "Risk Scores", "Macro Scenarios", "Alert Rules", "My Exposure Risk"];'
)

# ─── Step 3: Add useAuth + branch logic in Polisophic function ────────────────
content = content.replace(
    'export default function Polisophic() {\n  const router = useRouter();\n  const [tab, setTab] = useState("Event Feed");',
    '''export default function Polisophic() {
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState("Event Feed");

  // Branch exposure mapping for My Exposure Risk tab
  const BRANCH_CURRENCY: Record<string, { currency: string; pairs: string[]; regimeKey: string }> = {
    NYC: { currency: "USD", pairs: ["USD/MXN", "USD/GBP"], regimeKey: "US Interest Rate Trajectory" },
    MXC: { currency: "MXN", pairs: ["USD/MXN", "MXN/EUR"], regimeKey: "MXN Exchange Rate Pressure" },
    LDN: { currency: "GBP", pairs: ["GBP/USD", "GBP/EUR"], regimeKey: "GBP Trade Uncertainty" },
  };
  const branchCode = user?.branch?.code?.toUpperCase() ?? "NYC";
  const exposureInfo = BRANCH_CURRENCY[branchCode] ?? BRANCH_CURRENCY["NYC"];
  const relevantScore = RISK_SCORES.find(r => r.dimension === exposureInfo.regimeKey) ?? RISK_SCORES[0];
  const currencyFilterMap: Record<string, string[]> = {
    USD: ["USA", "USA"],
    MXN: ["MEX"],
    GBP: [],
  };
  const relevantEvents = RISK_EVENTS.filter(ev =>
    exposureInfo.currency === "USD" ? ev.region === "USA" :
    exposureInfo.currency === "MXN" ? ev.region === "MEX" :
    ev.category === "CENTRAL BANK"
  );'''
)

# ─── Step 4: Add tab content before the closing of overflow div ───────────────
exposure_tab = '''
        {/* ======= MY EXPOSURE RISK TAB ======= */}
        {tab === "My Exposure Risk" && (
          <div style={{ padding: "20px 28px", overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
              <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 600, color: S.primary }}>
                My Exposure Risk
              </span>
              <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary }}>
                {user?.branch?.name ?? "Branch"} · {exposureInfo.currency} exposure · {exposureInfo.pairs.join(", ")}
              </span>
              {!user && (
                <span style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.amber }}>
                  LOGIN TO SEE PERSONALISED RISK
                </span>
              )}
            </div>
            <div style={{ height: 1, background: S.rim, marginBottom: 20 }} />

            {/* Risk alert banner */}
            <div style={{
              padding: "16px 20px",
              marginBottom: 20,
              border: `1px solid ${relevantScore.regime === "HIGH" ? S.fail : relevantScore.regime === "ELEVATED" ? S.amber : S.cyan}`,
              borderLeft: `4px solid ${relevantScore.regime === "HIGH" ? S.fail : relevantScore.regime === "ELEVATED" ? S.amber : S.cyan}`,
              background: relevantScore.regime === "HIGH"
                ? "color-mix(in srgb,var(--accent-red,#B91C1C) 8%,transparent)"
                : relevantScore.regime === "ELEVATED"
                ? "color-mix(in srgb,var(--accent-amber) 8%,transparent)"
                : "color-mix(in srgb,var(--accent-cyan) 8%,transparent)",
            }}>
              <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.07em", marginBottom: 6 }}>
                EXPOSURE RISK ALERT · {branchCode} BRANCH · {exposureInfo.currency}
              </div>
              <div style={{ fontFamily: S.fontUI, fontSize: "0.875rem", fontWeight: 600, color: S.primary, marginBottom: 8 }}>
                Your {exposureInfo.currency} exposure is facing {relevantScore.regime} risk
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" as const }}>
                <ScoreBar score={relevantScore.score} />
                <RegimeChip regime={relevantScore.regime} />
                <span style={{ fontFamily: S.fontUI, fontSize: "0.5625rem", color: S.secondary, flex: 1 }}>
                  {relevantScore.dimension}: {relevantScore.driver}
                </span>
              </div>
            </div>

            {/* Hedge implication */}
            <div style={{ padding: "14px 16px", background: S.bgSub, border: `1px solid ${S.rim}`, marginBottom: 20 }}>
              <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.06em", marginBottom: 8 }}>
                HEDGE IMPLICATION FOR {exposureInfo.currency} EXPOSURE
              </div>
              <div style={{ fontFamily: S.fontUI, fontSize: "0.6875rem", color: S.secondary, lineHeight: 1.6 }}>
                {relevantScore.regime === "HIGH"
                  ? `Maximum hedge coverage recommended (90-95%). Board notification required. Activate contingency swap lines for ${exposureInfo.pairs[0]}.`
                  : relevantScore.regime === "ELEVATED"
                  ? `Maintain 80% NDF program. Consider adding tenor extension to ladder for ${exposureInfo.pairs[0]}. Quarterly review scheduled.`
                  : `Standard hedge program adequate (65-75% coverage). Annual review on schedule. No immediate action required for ${exposureInfo.pairs.join(", ")}.`
                }
              </div>
            </div>

            {/* Relevant events */}
            <div style={{ fontFamily: S.fontUI, fontSize: "0.75rem", fontWeight: 600, color: S.primary, marginBottom: 8 }}>
              Relevant Events for Your Portfolio
            </div>
            <div style={{ height: 1, background: S.rim, marginBottom: 0 }} />
            {(relevantEvents.length > 0 ? relevantEvents : RISK_EVENTS.slice(0, 3)).map((ev, i, arr) => {
              const sev = ev.severity >= 75 ? S.fail : ev.severity >= 55 ? S.amber : S.secondary;
              return (
                <div key={ev.id} style={{ padding: "12px 0", borderBottom: i < arr.length - 1 ? `1px solid ${S.soft}` : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" as const }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary }}>{ev.ts}</span>
                    <span style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", padding: "1px 4px", border: `1px solid ${S.cyan}`, color: S.cyan }}>{ev.category}</span>
                    {ev.alertTriggered && (
                      <span style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", padding: "1px 5px", border: `1px solid ${S.fail}`, color: S.fail }}>ALERT</span>
                    )}
                    <span style={{ marginLeft: "auto", fontFamily: S.fontMono, fontSize: "0.5rem", color: sev, fontWeight: 600 }}>SEV {ev.severity}</span>
                  </div>
                  <div style={{ fontFamily: S.fontUI, fontSize: "0.6875rem", color: S.primary, lineHeight: 1.45 }}>{ev.headline}</div>
                </div>
              );
            })}

            {/* Back link */}
            <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
              <a href="/dashboard" style={{
                fontFamily: S.fontMono, fontSize: "0.5rem", letterSpacing: "0.06em",
                padding: "4px 10px", border: `1px solid ${S.rim}`, color: S.tertiary,
                textDecoration: "none",
              }}>
                Back to Dashboard
              </a>
            </div>
          </div>
        )}
'''

# Insert before the closing of the scrollable content div
content = content.replace(
    '\n      </div>\n\n      <footer',
    exposure_tab + '\n      </div>\n\n      <footer',
    1
)

io.open('page.tsx', 'w', encoding='utf-8').write(content)

# ─── Verify ───────────────────────────────────────────────────────────────────
c = io.open('page.tsx', 'r', encoding='utf-8').read()
checks = {
    'useAuth import': 'useAuth' in c,
    '5 tabs': '"My Exposure Risk"' in c,
    'useAuth call': 'const { user } = useAuth();' in c,
    'branchCode': 'branchCode' in c,
    'exposure tab content': 'EXPOSURE RISK ALERT' in c,
    'hedge implication': 'HEDGE IMPLICATION' in c,
    'back link': 'Back to Dashboard' in c,
    'file size OK': len(c) > 20000,
}
for k, v in checks.items():
    print(f"  {'OK' if v else 'FAIL'} {k}")
print(f"\nFile length: {len(c)} chars")
