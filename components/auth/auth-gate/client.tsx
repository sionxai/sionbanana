"use client";

import { useState } from "react";
import Link from "next/link";
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
        <header className="flex items-center justify-between border-b bg-background/80 px-8 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex flex-col hover:opacity-90">
              <span className="text-sm font-semibold text-foreground">YesGem Studio</span>
              <span className="text-xs text-muted-foreground">AI 이미지 생성 & 워크플로우</span>
            </Link>
            <Separator orientation="vertical" className="mx-2 hidden h-6 lg:block" />
            <Badge variant="secondary" className="hidden lg:inline-flex">
              알파 버전
            </Badge>
          </div>
          <div className="flex flex-col items-end gap-2 md:flex-row md:items-center md:gap-4">
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
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl font-semibold">YesGem Studio</CardTitle>
          <CardDescription>AI 기반 이미지 제작 워크플로우를 사용하려면 로그인 해주세요.</CardDescription>
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
