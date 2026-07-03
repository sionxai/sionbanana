import { StudioNavigation } from "@/components/studio/studio-navigation";
import { ShutdownButton } from "@/components/studio/shutdown-button";

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <ShutdownButton />
      <main className="flex-1 pb-24">{children}</main>
      <StudioNavigation />
    </div>
  );
}
