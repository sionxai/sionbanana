"use client";

import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { GenerationMode } from "@/lib/types";

const MODES: Array<{
  id: GenerationMode | "presets";
  label: string;
  description: string;
  href?: string;
}> = [
  { id: "create", label: "편집", description: "기본 프롬프트 기반 이미지 생성" },
  { id: "camera", label: "카메라", description: "화각 및 렌즈 스타일 변경" },
  { id: "lighting", label: "조명 및 배색", description: "조명과 컬러그레이딩 프리셋 적용" },
  { id: "pose", label: "포즈", description: "표정과 자세 프리셋 적용" },
  { id: "style", label: "스타일", description: "영상 프리셋 기반 스타일 가이드" },
  { id: "external", label: "외부 프리셋", description: "예시 기반 프롬프트 컬렉션" },
  { id: "sketch", label: "스케치", description: "스케치를 이미지로 변환" },
  {
    id: "presets",
    label: "프리셋",
    description: "자주 쓰는 시나리오 모음",
    href: "/studio/presets"
  }
];

type StudioWorkspaceHeaderProps = {
  activeMode: GenerationMode;
  loading: boolean;
  historyCount: number;
  onModeChange: (mode: GenerationMode) => void;
};

export function StudioWorkspaceHeader({
  activeMode,
  loading,
  historyCount,
  onModeChange
}: StudioWorkspaceHeaderProps) {
  return (
    <div className="border-b bg-gradient-to-r from-background via-background to-background/95 shadow-sm">
      <div className="flex items-center justify-between px-8 py-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold text-foreground tracking-tight">작업 공간</h2>
          <p className="text-sm text-muted-foreground">프롬프트 작성부터 결과 비교까지 한 번에 관리하세요.</p>
        </div>
        <div className="hidden items-center gap-3 text-sm text-muted-foreground md:flex">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-medium">
              {loading ? "기록 동기화 중" : `최근 기록 ${historyCount}건`}
            </span>
          </div>
        </div>
      </div>
      <div className="border-t bg-muted/60 backdrop-blur-sm">
        <Tabs value={activeMode} onValueChange={value => onModeChange(value as GenerationMode)}>
          <div className="px-4 py-3">
            <TabsList className="flex flex-wrap gap-1 bg-background/80 backdrop-blur-sm rounded-lg p-1 shadow-sm border">
              {MODES.map(mode => (
                mode.href ? (
                  <Link
                    key={mode.id}
                    href={mode.href}
                    className={cn(
                      "rounded-lg border border-transparent px-3 py-2 text-xs transition-all duration-200",
                      "bg-background/70 text-foreground hover:bg-primary/10 hover:border-primary/20",
                      "flex flex-col text-center shadow-sm hover:shadow-md transform hover:-translate-y-0.5"
                    )}
                  >
                    <span className="font-medium leading-none">{mode.label}</span>
                  </Link>
                ) : (
                  <TabsTrigger
                    key={mode.id}
                    value={mode.id}
                    onClick={() => onModeChange(mode.id as GenerationMode)}
                    className={cn(
                      "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg",
                      "rounded-lg border border-transparent px-3 py-2 text-xs transition-all duration-200",
                      "bg-background/50 text-muted-foreground hover:bg-background/70 hover:text-foreground",
                      "data-[state=active]:border-primary/30 hover:shadow-sm transform hover:-translate-y-0.5",
                      "flex flex-col text-center"
                    )}
                  >
                    <span className="font-medium leading-none">{mode.label}</span>
                  </TabsTrigger>
                )
              ))}
            </TabsList>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
