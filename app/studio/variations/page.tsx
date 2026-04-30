"use client";

import dynamic from "next/dynamic";
import { PresetLibraryProvider } from "@/components/studio/preset-library-context";

const VariationsStudioShell = dynamic(
  () => import("@/components/studio/variations-studio-shell").then(mod => mod.VariationsStudioShell),
  { ssr: false, loading: () => null }
);

export default function VariationsStudioPage() {
  return (
    <PresetLibraryProvider>
      <VariationsStudioShell />
    </PresetLibraryProvider>
  );
}
