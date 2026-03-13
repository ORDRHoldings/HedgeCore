'use client';
/**
 * ORDR Market — Root Page
 *
 * Renders the full institutional trading workspace.
 * ChartWorkspace owns the entire viewport: top bar, rails, canvas, bottom strip.
 */
import ChartWorkspace from '@/components/workspace/ChartWorkspace';

export default function HomePage() {
  return <ChartWorkspace />;
}
