"use client";

import dynamic from "next/dynamic";

const BatchStudioShell = dynamic(
  () => import("@/components/studio/batch-studio-shell").then(mod => mod.BatchStudioShell),
  { ssr: false, loading: () => null }
);

export default function BatchStudioPage() {
  return <BatchStudioShell />;
}
