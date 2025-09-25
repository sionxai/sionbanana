import AuthGate from "@/components/auth/auth-gate";
import { StudioNavigation } from "@/components/studio/studio-navigation";

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="relative flex min-h-screen flex-col">
        <main className="flex-1 pb-24">{children}</main>
        <StudioNavigation />
      </div>
    </AuthGate>
  );
}
