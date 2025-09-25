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

const schema = z
  .object({
    displayName: z.string().min(2, "닉네임은 2자 이상 입력해주세요."),
    email: z.string().email("올바른 이메일 주소를 입력해주세요."),
    password: z.string().min(6, "비밀번호는 최소 6자 이상이어야 합니다."),
    confirmPassword: z.string()
  })
  .refine(values => values.password === values.confirmPassword, {
    message: "비밀번호가 일치하지 않습니다.",
    path: ["confirmPassword"]
  });

type FormValues = z.infer<typeof schema>;

export function RegisterForm() {
  const { register: registerUser } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: "",
      email: "",
      password: "",
      confirmPassword: ""
    }
  });
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = handleSubmit(async values => {
    try {
      setSubmitting(true);
      await registerUser({
        email: values.email,
        password: values.password,
        displayName: values.displayName
      });
      toast.success("회원가입 완료", { description: "이제 YesGem Studio를 이용해보세요." });
    } catch (error) {
      console.error(error);
      toast.error("회원가입 실패", { description: "이미 사용 중인 이메일인지 확인해주세요." });
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="register-displayName">닉네임</Label>
        <Input id="register-displayName" placeholder="Creator" {...register("displayName")} />
        {errors.displayName ? <p className="text-xs text-destructive">{errors.displayName.message}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="register-email">이메일</Label>
        <Input id="register-email" type="email" autoComplete="email" placeholder="you@example.com" {...register("email")} />
        {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="register-password">비밀번호</Label>
        <Input id="register-password" type="password" autoComplete="new-password" placeholder="••••••" {...register("password")} />
        {errors.password ? <p className="text-xs text-destructive">{errors.password.message}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="register-confirm-password">비밀번호 확인</Label>
        <Input id="register-confirm-password" type="password" autoComplete="new-password" placeholder="••••••" {...register("confirmPassword")} />
        {errors.confirmPassword ? <p className="text-xs text-destructive">{errors.confirmPassword.message}</p> : null}
      </div>
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "가입 중..." : "회원가입"}
      </Button>
    </form>
  );
}
