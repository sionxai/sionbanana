"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AuthGate from "@/components/auth/auth-gate";
import PresetManagement from "@/components/admin/PresetManagement";
import { useAuth } from "@/components/providers/auth-provider";
import { ADMIN_UID } from "@/lib/constants";

export default function AdminPresetsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user?.uid !== ADMIN_UID) {
      router.replace("/admin");
    }
  }, [loading, user?.uid, router]);

  if (loading || user?.uid !== ADMIN_UID) {
    return null;
  }

  return (
    <AuthGate>
      <div className="p-6">
        <PresetManagement />
      </div>
    </AuthGate>
  );
}
