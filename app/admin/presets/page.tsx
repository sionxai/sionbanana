"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AuthGate from "@/components/auth/auth-gate";
import PresetManagement from "@/components/admin/PresetManagement";
import VideoStyleManagement from "@/components/admin/VideoStyleManagement";
import { useAuth } from "@/components/providers/auth-provider";
import { ADMIN_UID } from "@/lib/constants";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
        <Tabs defaultValue="presets" className="space-y-4">
          <TabsList>
            <TabsTrigger value="presets">프리셋 관리</TabsTrigger>
            <TabsTrigger value="videoStyles">영상 스타일 관리</TabsTrigger>
          </TabsList>
          <TabsContent value="presets">
            <PresetManagement />
          </TabsContent>
          <TabsContent value="videoStyles">
            <VideoStyleManagement />
          </TabsContent>
        </Tabs>
      </div>
    </AuthGate>
  );
}
