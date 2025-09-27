// REST API 기반 채팅 관리 훅
"use client";

import { useState, useEffect } from "react";
import { getAdminChatRoomsViaRest } from "@/lib/firebase/rest-api";
import type { ChatRoom } from "@/lib/types";

export function useAdminChatsRest() {
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadChatRooms = async () => {
      const { ADMIN_UID } = await import("@/lib/constants");

      setLoading(true);
      setError(null);

      try {
        console.log("[useAdminChatsRest] Loading admin chat rooms via REST API for:", ADMIN_UID);

        // localStorage 디버깅 정보
        const recentChatIds = localStorage.getItem('recentChatIds');
        console.log("[useAdminChatsRest] 🔍 LocalStorage debug:", {
          recentChatIds: recentChatIds,
          parsed: recentChatIds ? JSON.parse(recentChatIds) : null,
          localStorage: { ...localStorage }
        });

        if (!recentChatIds || recentChatIds === '[]') {
          console.log("[useAdminChatsRest] ⚠️ No chat IDs found in localStorage - no user chats created yet");
        } else {
          console.log("[useAdminChatsRest] ✅ Found chat IDs in localStorage, proceeding with REST API calls");
        }

        const rooms = await getAdminChatRoomsViaRest(ADMIN_UID);
        console.log("[useAdminChatsRest] Received chat rooms:", rooms);

        setChatRooms(rooms);
      } catch (err: any) {
        console.error("[useAdminChatsRest] Error loading chat rooms:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadChatRooms();
  }, []);

  return {
    chatRooms,
    loading,
    error
  };
}