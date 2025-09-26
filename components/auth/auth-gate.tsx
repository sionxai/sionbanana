"use client";

import dynamic from "next/dynamic";

const AuthGateInner = dynamic(() => import("@/components/auth/auth-gate/client"), {
  ssr: false
});

export function AuthGate({ children }: { children: React.ReactNode }) {
  return <AuthGateInner>{children}</AuthGateInner>;
}

export default AuthGate;
