"use client";

import dynamic from "next/dynamic";

const UsageView = dynamic(() => import("./usage-view").then(mod => mod.UsageView), {
  ssr: false,
  loading: () => null
});

export default function UsagePage() {
  return <UsageView />;
}
