"use client";

import { useState } from "react";
import { Loader2, Power } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ShutdownButton() {
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [isShutdownComplete, setIsShutdownComplete] = useState(false);

  const handleShutdown = async () => {
    if (isShuttingDown) return;

    const confirmed = window.confirm("시온바나나 서버를 종료할까요? 다시 켜려면 앱 아이콘을 실행하세요.");
    if (!confirmed) return;

    setIsShuttingDown(true);

    try {
      const response = await fetch("/api/shutdown", { method: "POST" });
      const payload = await response.json().catch(() => null) as { reason?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.reason ?? "서버 종료 요청에 실패했습니다.");
      }

      toast.success("서버를 종료했습니다. 창을 닫아도 됩니다.");
      setIsShutdownComplete(true);
      try {
        window.close();
      } catch (closeError) {
        console.warn("Window close was blocked after shutdown.", closeError);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "서버 종료 요청에 실패했습니다.";
      toast.error(message);
      setIsShuttingDown(false);
    }
  };

  if (isShutdownComplete) {
    return (
      <div
        className="fixed inset-0 z-[2147483647] flex min-h-screen items-center justify-center bg-neutral-950 px-6 text-white"
        role="status"
        aria-live="polite"
      >
        <div className="flex max-w-xl flex-col items-center text-center">
          <Power className="mb-5 h-12 w-12" aria-hidden="true" />
          <p className="text-2xl font-semibold">서버를 종료했습니다</p>
          <p className="mt-4 text-base text-neutral-200">이 창은 ⌘W 또는 창의 닫기 버튼으로 닫아주세요</p>
          <p className="mt-2 text-base text-neutral-300">다시 켜려면 Dock의 SionBanana 아이콘을 실행하세요</p>
        </div>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="destructive"
      size="sm"
      className="fixed right-3 top-3 z-[45] h-8 gap-1.5 px-2.5 shadow-md sm:right-4 sm:top-4"
      onClick={handleShutdown}
      disabled={isShuttingDown}
      aria-label="시온바나나 서버 종료"
      title="서버 종료"
    >
      {isShuttingDown ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Power className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span>종료</span>
    </Button>
  );
}
