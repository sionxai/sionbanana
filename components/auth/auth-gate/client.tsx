"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/components/auth/login-form";
import { RegisterForm } from "@/components/auth/register-form";
import { useAuth } from "@/components/providers/auth-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import UserMenu from "@/components/account/user-menu";
import AccountMenu from "@/components/account/account-menu";

function AuthGateClient({ children }: { children: React.ReactNode }) {
  const { user, logout, loading } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-sm text-muted-foreground">사용자 정보를 확인하고 있습니다...</div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between border-b bg-background/80 px-8 py-4 backdrop-blur overflow-visible relative z-[10000]">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex flex-col items-center gap-0.5 hover:opacity-90">
              <Image
                src="/img/logo/logo.png"
                alt="시온 바나나 로고"
                width={56}
                height={56}
                className="object-contain"
                priority
              />
              <span className="text-[9px] text-muted-foreground text-center leading-none">AI 이미지 생성 워크플로우</span>
            </Link>
            <Separator orientation="vertical" className="mx-2 hidden h-6 lg:block" />
            <Badge variant="secondary" className="hidden lg:inline-flex">
              1.53v
            </Badge>
            <Link href="/prompt" className="text-xs text-muted-foreground transition hover:text-foreground lg:hidden">
              프롬프트 생성
            </Link>
            <nav className="hidden items-center gap-3 text-sm font-medium text-muted-foreground lg:flex">
              <Link href="/studio" className="transition hover:text-foreground">
                스튜디오
              </Link>
              <Link href="/prompt" className="transition hover:text-foreground">
                프롬프트 생성
              </Link>
            </nav>
          </div>
          <div className="flex flex-col items-end gap-2 md:flex-row md:items-center md:gap-4 relative overflow-visible">
            <UserMenu />
            <AccountMenu />
          </div>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md border-border/60 shadow-lg">
        <CardHeader className="space-y-4">
          <div className="flex flex-col items-center gap-2">
            <Image
              src="/img/logo/logo.png"
              alt="시온 바나나 로고"
              width={80}
              height={80}
              className="object-contain"
              priority
            />
            <div className="text-center">
              <CardTitle className="text-2xl font-semibold mb-0.5">시온 바나나</CardTitle>
              <div className="text-xs text-muted-foreground">AI 이미지 생성 워크플로우</div>
            </div>
          </div>
          <CardDescription className="text-center">로그인하여 AI 기반 이미지 제작을 시작해보세요.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-2 text-sm">
            <Button
              type="button"
              variant={mode === "login" ? "default" : "outline"}
              className="flex-1"
              onClick={() => setMode("login")}
            >
              로그인
            </Button>
            <Button
              type="button"
              variant={mode === "register" ? "default" : "outline"}
              className="flex-1"
              onClick={() => setMode("register")}
            >
              회원가입
            </Button>
          </div>
          {mode === "login" ? <LoginForm /> : <RegisterForm />}
        </CardContent>
      </Card>
    </div>
  );
}

export default AuthGateClient;
