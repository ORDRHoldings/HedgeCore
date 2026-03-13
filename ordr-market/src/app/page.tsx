'use client';
/**
 * ORDR Market — Root Page
 *
 * Renders the modular institutional trading workspace.
 * WorkspaceShell owns the entire viewport: command bar, adaptive rails,
 * chart core, tabbed sidebar, bottom dock, and status bar.
 */
import WorkspaceShell from '@/components/workspace/WorkspaceShell';

export default function HomePage() {
  return <WorkspaceShell />;
}
