"use client";

import dynamic from "next/dynamic";
import { StudioNavigation } from "@/components/studio/studio-navigation";

const UsageView = dynamic(() => import("./usage-view").then(mod => mod.UsageView), {
  ssr: false,
  loading: () => null
});

export default function UsagePage() {
  return (
    <div className="relative min-h-screen">
      <UsageView />
      <StudioNavigation />
    </div>
  );
}
