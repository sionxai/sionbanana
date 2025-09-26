"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { firebaseAuth } from "@/lib/firebase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { ADMIN_UID } from "@/lib/constants";

type StatusResponse = {
  role?: string;
  email?: string | null;
  displayName?: string | null;
};

async function fetchWithToken(path: string) {
  const auth = firebaseAuth();
  const user = auth?.currentUser;
  const token = user ? await user.getIdToken() : "";
  return fetch(path, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined
  });
}

export default function AccountMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<string | undefined>(undefined);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetchWithToken("/api/user/status");
        if (res.ok) {
          const json = (await res.json()) as StatusResponse;
          setRole(json?.role ?? undefined);
        }
      } catch {}
    };
    run();
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!open) return;
      const target = e.target as Node;
      if (panelRef.current && !panelRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const initial = (user?.email?.[0] || user?.displayName?.[0] || "Y").toUpperCase();

  const isAdminFallback = user?.uid === ADMIN_UID;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/60"
      >
        <div className="hidden text-right text-sm leading-tight md:block">
          <p className="font-medium text-foreground">{user?.displayName ?? "게스트"}</p>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
        </div>
        <Avatar className="h-9 w-9">
          <AvatarImage src={user?.photoURL ?? undefined} alt="profile" />
          <AvatarFallback>{initial}</AvatarFallback>
        </Avatar>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-[9999] mt-2 w-48 rounded-md border bg-background p-1 shadow-md"
        >
          <Link
            href="/billing"
            className="block rounded px-2 py-2 text-sm hover:bg-muted"
            onClick={() => setOpen(false)}
          >
            플랜 변경
          </Link>
          <Link
            href="/account"
            className="block rounded px-2 py-2 text-sm hover:bg-muted"
            onClick={() => setOpen(false)}
          >
            회원정보
          </Link>
          {(role === "admin" || isAdminFallback) && (
            <Link
              href="/admin"
              className="block rounded px-2 py-2 text-sm hover:bg-muted"
              onClick={() => setOpen(false)}
            >
              관리자 콘솔
            </Link>
          )}
          <button
            type="button"
            className="block w-full rounded px-2 py-2 text-left text-sm hover:bg-muted"
            onClick={async () => {
              setOpen(false);
              await logout();
            }}
          >
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}
