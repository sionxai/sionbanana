"use client";

import dynamic from "next/dynamic";

// 단일 사용자 도구라 SSR이 필요하지 않고,
// studio-shell의 client-side 상태(localStorage, crypto.randomUUID 슬롯)와
// SSR이 충돌해 hydration mismatch + ref 무한 루프가 발생하므로 ssr:false로 강제한다.
const StudioShell = dynamic(
  () => import("@/components/studio/studio-shell").then(mod => mod.StudioShell),
  { ssr: false, loading: () => null }
);

export default function StudioSinglePage() {
  return <StudioShell />;
}
