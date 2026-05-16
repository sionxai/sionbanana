"use client";

import dynamic from "next/dynamic";

const CharactersShell = dynamic(
  () => import("@/components/studio/characters-shell").then(mod => mod.CharactersShell),
  { ssr: false, loading: () => null }
);

export default function StudioCharactersPage() {
  return <CharactersShell />;
}
