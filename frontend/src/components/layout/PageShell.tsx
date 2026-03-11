import { T } from "@/lib/design/tokens";
import { PageHeader } from "./PageHeader";
import type { LucideIcon } from "lucide-react";

interface PageShellProps {
  icon: LucideIcon;
  title: string;
  breadcrumb?: string[];
  actions?: React.ReactNode;
  noPadding?: boolean;
  children: React.ReactNode;
}

export function PageShell({ icon, title, breadcrumb, actions, noPadding, children }: PageShellProps) {
  return (
    <div style={{ minHeight: "100vh", background: T.bgDeep }}>
      <PageHeader icon={icon} title={title} breadcrumb={breadcrumb} actions={actions} />
      <div style={noPadding ? undefined : { padding: "24px 28px" }}>
        {children}
      </div>
    </div>
  );
}
