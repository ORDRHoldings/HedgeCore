"use client";

interface Badge {
  label: string;
  variant: 'info' | 'warning' | 'success' | 'neutral';
}

interface Props {
  title: string;
  subtitle?: string;
  badge?: Badge;
  actions?: React.ReactNode;
  children: React.ReactNode;
  sectionNumber?: string;
}

const badgeStyles: Record<string, string> = {
  info: 'bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border-[var(--accent-cyan)]/20',
  warning: 'bg-[var(--accent-amber)]/10 text-[var(--accent-amber)] border-[var(--accent-amber)]/20',
  success: 'bg-[var(--accent-green)]/10 text-[var(--accent-green)] border-[var(--accent-green)]/20',
  neutral: 'bg-[var(--bg-sub)] text-[var(--text-secondary)] border-[var(--border-rim)]',
};

export default function SectionCard({ title, subtitle, badge, actions, children, sectionNumber }: Props) {
  return (
    <section className="bg-[var(--bg-panel)] rounded-sm border border-[var(--border-rim)]">
      <div className="px-4 py-2.5 border-b border-[var(--border-soft)] flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {sectionNumber && <span className="section-number">{sectionNumber}</span>}
          <div>
            <h3 className="section-title">{title}</h3>
            {subtitle && <p className="text-sm text-[var(--text-secondary)]">{subtitle}</p>}
          </div>
          {badge && (
            <span className={`inline-block border rounded-sm px-2 py-0.5 text-[10px] font-mono font-medium ${badgeStyles[badge.variant]}`}>
              {badge.label}
            </span>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="px-4 py-2">{children}</div>
    </section>
  );
}
