import { T } from "@/lib/design/tokens";

interface KpiItem {
  label: string;
  value: string | number;
  color?: string;
}

interface KpiStripProps {
  items: KpiItem[];
  loading?: boolean;
}

export function KpiStrip({ items, loading }: KpiStripProps) {
  if (loading) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${items.length || 4}, 1fr)`, gap: 1, background: T.rim, border: `1px solid ${T.rim}`, borderRadius: 4, overflow: "hidden" }}>
        {Array.from({ length: items.length || 4 }).map((_, i) => (
          <div key={i} style={{ background: T.bgPanel, padding: "14px 16px" }}>
            <div style={{ height: 12, width: 80, background: T.soft, borderRadius: 2, marginBottom: 6 }} />
            <div style={{ height: 18, width: 60, background: T.soft, borderRadius: 2 }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 1, background: T.rim, border: `1px solid ${T.rim}`, borderRadius: 4, overflow: "hidden" }}>
      {items.map((item) => (
        <div key={item.label} style={{ background: T.bgPanel, padding: "14px 16px" }}>
          <div style={{ fontFamily: T.fontUI, fontSize: 12, fontWeight: 500, color: T.tertiary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {item.label}
          </div>
          <div style={{ fontFamily: T.fontMono, fontSize: 16, fontWeight: 700, color: item.color || T.primary, marginTop: 4 }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
