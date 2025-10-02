"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/studio", label: "단일 생성" },
  { href: "/studio/variations", label: "변형 생성" },
  { href: "/studio/batch", label: "배치 생성" },
  { href: "/studio/presets", label: "프리셋" },
  { href: "/chat", label: "1:1 상담하기" }
];

export function StudioNavigation() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/90 backdrop-blur">
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
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
