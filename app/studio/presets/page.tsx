"use client";

import dynamic from "next/dynamic";

const PresetsShell = dynamic(
  () => import("@/components/presets/presets-shell").then(mod => mod.PresetsShell),
  { ssr: false, loading: () => null }
);

export default function StudioPresetsPage() {
  return <PresetsShell />;
}
