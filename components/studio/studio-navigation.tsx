"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/studio", label: "단일 생성" },
  { href: "/studio/variations", label: "변형 생성" },
  { href: "/studio/batch", label: "배치 생성" },
  { href: "/studio/presets", label: "프리셋" },
  { href: "/studio/story", label: "스토리" },
  { href: "/studio/history", label: "생성기록" },
  { href: "/usage", label: "사용량" }
];

export function StudioNavigation() {
  const pathname = usePathname();
  const [authStatus, setAuthStatus] = useState<"unknown" | "missing" | "web" | "codex-cli">("unknown");

  useEffect(() => {
    let cancelled = false;
    async function loadAuthStatus() {
      try {
        const response = await fetch("/api/auth/status", { cache: "no-store" });
        const body = (await response.json()) as {
          authenticated?: boolean;
          source?: "web" | "codex-cli";
        };
        if (cancelled) return;
        setAuthStatus(body.authenticated ? body.source ?? "codex-cli" : "missing");
      } catch {
        if (!cancelled) {
          setAuthStatus("missing");
        }
      }
    }
    void loadAuthStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/90 backdrop-blur">
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-1 left-2 select-none font-mono text-[10px] text-muted-foreground/50"
      >
        3.7v
      </span>
      <div className="mx-auto flex max-w-6xl items-center justify-around px-4 py-2">
        {navItems.map(item => {
          const isActive = pathname === item.href || (pathname?.startsWith(item.href) && item.href !== "/studio");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span>{item.label}</span>
              {item.href === "/usage" && authStatus !== "unknown" ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    authStatus === "missing"
                      ? "bg-amber-500/10 text-amber-600"
                      : "bg-emerald-500/10 text-emerald-600"
                  )}
                >
                  {authStatus === "missing" ? "로그인" : authStatus === "web" ? "Web" : "CLI"}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
