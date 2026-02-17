"use client";

import EmptyState from "../ui/EmptyState";
import type { TimelineEvent } from "../../api/pipelineTypes";

interface TimelineTabProps {
  timeline: TimelineEvent[];
}

export default function TimelineTab({ timeline }: TimelineTabProps) {
  if (timeline.length === 0) {
    return <EmptyState type="empty" message="No timeline events" />;
  }

  return (
    <div className="space-y-2">
      {timeline.map((e, i) => (
        <div
          key={i}
          className="flex gap-2 text-xs border-b border-[var(--border-rim)]/50 pb-2"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-cyan)] mt-1.5 shrink-0" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-[var(--text-primary)]">
                {e.event_type}
              </span>
              <span className="text-[var(--text-tertiary)]">{e.actor}</span>
            </div>
            <p className="text-[var(--text-secondary)] mt-0.5">{e.detail}</p>
            <span className="text-[0.625rem] text-[var(--text-tertiary)]">
              {new Date(e.timestamp).toLocaleString()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
