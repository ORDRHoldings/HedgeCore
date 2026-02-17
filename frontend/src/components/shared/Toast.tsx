"use client";

import { useEffect } from 'react';

interface Props {
  message: string;
  visible: boolean;
  onClose: () => void;
}

export default function Toast({ message, visible, onClose }: Props) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 bg-[var(--accent-green)] text-white px-4 py-3 rounded-sm shadow-lg text-sm font-medium transition-opacity">
      {message}
    </div>
  );
}
