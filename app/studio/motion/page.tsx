"use client";

import dynamic from "next/dynamic";

const MotionShell = dynamic(
  () => import("@/components/studio/motion/motion-shell").then(mod => mod.MotionShell),
  { ssr: false, loading: () => null }
);

export default function MotionPage() {
  return <MotionShell />;
}
