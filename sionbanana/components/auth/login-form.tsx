"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import { toast } from "sonner";

const schema = z.object({
  email: z.string().email("올바른 이메일 주소를 입력해주세요."),
  password: z.string().min(6, "비밀번호는 최소 6자 이상이어야 합니다.")
});

type FormValues = z.infer<typeof schema>;

export function LoginForm() {
  const { login, resetPassword } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: "",
      password: ""
    }
  });
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = handleSubmit(async values => {
    try {
      setSubmitting(true);
      await login(values.email, values.password);
      toast.success("로그인 성공", { description: "YesGem Studio에 오신 것을 환영합니다." });
    } catch (error) {
      console.error(error);
      toast.error("로그인 실패", { description: "이메일 또는 비밀번호를 확인해주세요." });
    } finally {
      setSubmitting(false);
    }
  });

  const handleReset = async () => {
    const email = (document.getElementById("login-email") as HTMLInputElement | null)?.value;
    if (!email) {
      toast.error("비밀번호 재설정", { description: "등록된 이메일 주소를 입력해주세요." });
      return;
    }

    try {
      setSubmitting(true);
      await resetPassword(email);
      toast.success("메일 발송", { description: "비밀번호 재설정 메일을 확인해주세요." });
    } catch (error) {
      console.error(error);
      toast.error("재설정 실패", { description: "잠시 후 다시 시도해주세요." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="login-email">이메일</Label>
        <Input id="login-email" type="email" autoComplete="email" placeholder="you@example.com" {...register("email")} />
        {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="login-password">비밀번호</Label>
        <Input id="login-password" type="password" autoComplete="current-password" placeholder="••••••" {...register("password")} />
        {errors.password ? <p className="text-xs text-destructive">{errors.password.message}</p> : null}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <button type="button" className="underline" onClick={handleReset} disabled={submitting}>
          비밀번호를 잊으셨나요?
        </button>
      </div>
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "로그인 중..." : "로그인"}
      </Button>
    </form>
  );
}
