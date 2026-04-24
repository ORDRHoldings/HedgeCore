"use client";
import FeatureErrorPage from "@/components/ui/FeatureErrorPage";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <FeatureErrorPage feature="trade-history" error={error} reset={reset} />;
}
