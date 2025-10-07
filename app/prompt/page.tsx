import dynamic from "next/dynamic";

const StoryboardGenerator = dynamic(
  () => import("@/components/prompt/storyboard-generator").then(m => ({ default: m.StoryboardGenerator })),
  { ssr: false }
);

export default function PromptGeneratorPage() {
  return <StoryboardGenerator />;
}
