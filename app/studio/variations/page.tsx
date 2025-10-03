import { VariationsStudioShell } from "@/components/studio/variations-studio-shell";
import { PresetLibraryProvider } from "@/components/studio/preset-library-context";

export default function VariationsStudioPage() {
  return (
    <PresetLibraryProvider>
      <VariationsStudioShell />
    </PresetLibraryProvider>
  );
}