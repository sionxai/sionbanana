"use client";

import dynamic from "next/dynamic";

const StoryStudioShell = dynamic(
  () => import("@/components/studio/story-studio-shell").then(mod => mod.StoryStudioShell),
  { ssr: false, loading: () => null }
);

export default function StudioStoryPage() {
  return <StoryStudioShell />;
}
