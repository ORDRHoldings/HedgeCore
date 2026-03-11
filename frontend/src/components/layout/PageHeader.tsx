import { T } from "@/lib/design/tokens";
import { Icon } from "@/components/ui/Icon";
import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  breadcrumb?: string[];
  actions?: React.ReactNode;
}

export function PageHeader({ icon, title, breadcrumb, actions }: PageHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 24px",
        borderBottom: `1px solid ${T.rim}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Icon icon={icon} size={20} color={T.tertiary} />
        <div>
          <div style={{ fontFamily: T.fontUI, fontSize: 16, fontWeight: 600, color: T.primary }}>
            {title}
          </div>
          {breadcrumb && breadcrumb.length > 0 && (
            <nav aria-label="Breadcrumb">
              <div style={{ fontFamily: T.fontUI, fontSize: 12, color: T.tertiary, marginTop: 2 }}>
                {breadcrumb.join(" \u2192 ")}
              </div>
            </nav>
          )}
        </div>
      </div>
      {actions && <div style={{ display: "flex", gap: 8 }}>{actions}</div>}
    </div>
  );
}
