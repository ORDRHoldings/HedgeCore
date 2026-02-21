"use client";

import EmptyState from "@/components/ui/EmptyState";

interface Props {
  title: string;
  message: string;
}

export default function ConnectorPlaceholderLane({ title, message }: Props) {
  return (
    <div style={{ padding: "16px 0" }}>
      <EmptyState type="empty" title={title} message={message} />
    </div>
  );
}
