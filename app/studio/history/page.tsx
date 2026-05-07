"use client";

import dynamic from "next/dynamic";

const GenerationHistoryView = dynamic(
  () => import("@/components/studio/generation-history-view").then(mod => mod.GenerationHistoryView),
  { ssr: false, loading: () => null }
);

export default function StudioHistoryPage() {
  return <GenerationHistoryView />;
}
