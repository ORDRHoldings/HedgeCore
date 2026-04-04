'use client';
/**
 * ORDR Market — Root Page
 *
 * Mobile (<768px or touch-primary): MobileWorkspace — full-screen chart, essential controls
 * Desktop: WorkspaceShell — full institutional workspace
 */
import { useEffect, useState } from 'react';
import WorkspaceShell from '@/components/workspace/WorkspaceShell';
import MobileWorkspace from '@/components/workspace/MobileWorkspace';

function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.innerWidth < 768) return true;
  if ('ontouchstart' in window && window.innerWidth < 1024) return true;
  return false;
}

export default function HomePage() {
  const [mobile, setMobile] = useState<boolean | null>(null);

  useEffect(() => {
    setMobile(isMobileDevice());
    const handler = () => setMobile(isMobileDevice());
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // SSR / first paint: hold until client knows viewport
  if (mobile === null) return null;

  return mobile ? <MobileWorkspace /> : <WorkspaceShell />;
}
