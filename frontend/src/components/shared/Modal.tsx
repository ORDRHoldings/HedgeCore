"use client";

import { useEffect } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'sm' | 'md' | 'lg';
}

const widthMap = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' };

export default function Modal({ open, onClose, title, subtitle, children, footer, width = 'md' }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', handler);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className={`bg-[var(--bg-sub)] rounded-sm shadow-2xl border border-[var(--border-rim)] ${widthMap[width]} w-full max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
          <div className="px-6 py-4 border-b border-[var(--border-soft)]">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h3>
            {subtitle && <p className="text-sm text-[var(--text-secondary)] mt-0.5">{subtitle}</p>}
          </div>
          <div className="px-6 py-4">{children}</div>
          {footer && (
            <div className="px-6 py-4 border-t border-[var(--border-soft)] flex justify-end gap-3">
              {footer}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
