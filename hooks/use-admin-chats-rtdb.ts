// Realtime Database 기반 관리자 채팅 훅
"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { ADMIN_UID } from "@/lib/constants";
import { subscribeToAdminChatRoomsRTDB } from "@/lib/firebase/realtime-chat-sdk";
import type { ChatRoom } from "@/lib/types";

export function useAdminChatsRTDB() {
  const { user, loading: authLoading } = useAuth();
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const setupRealtimeSubscription = async () => {
      const startTime = performance.now();

      // 인증이 완료될 때까지 대기
      if (authLoading) {
        console.log("[useAdminChatsRTDB] Waiting for auth to complete...");
        return;
      }

      // 관리자 권한 확인
      if (!user || user.uid !== ADMIN_UID) {
        console.log("[useAdminChatsRTDB] User is not admin or not authenticated");
        setLoading(false);
        setError("관리자 권한이 필요합니다");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        console.log("[useAdminChatsRTDB] ⏱️ Starting Realtime Database subscription at:", startTime);
        console.log("[useAdminChatsRTDB] Loading admin chat rooms with Realtime Database for:", user.uid);

        // 실시간 구독 설정
        unsubscribe = subscribeToAdminChatRoomsRTDB(
          ADMIN_UID,
          (rooms) => {
            const endTime = performance.now();
            const loadTime = Math.round(endTime - startTime);
            console.log("[useAdminChatsRTDB] ⏱️ Real-time update completed in:", loadTime, "ms");
            console.log("[useAdminChatsRTDB] Received chat rooms update:", rooms.length);

            // 데이터 구조 변환 (기존 코드 호환성을 위해)
            const formattedRooms = rooms.map(room => ({
              id: room.id,
              participants: room.participants,
              participantNames: room.participantNames,
              lastMessage: room.lastMessage,
              lastMessageAt: room.lastMessageAt,
              updatedAt: room.updatedAt,
              createdAt: room.createdAt,
              unreadCount: room.unreadCount
            })) as ChatRoom[];

            console.log("[useAdminChatsRTDB] Processed and formatted chat rooms:", formattedRooms.length);

            setChatRooms(formattedRooms);
            setLoading(false);
          },
          (err) => {
            console.error("[useAdminChatsRTDB] Real-time subscription error:", err);

            // 네트워크 오류 처리
            if (err.message.includes('permission-denied')) {
              setError("Realtime Database 권한이 거부되었습니다. 인증 상태를 확인해주세요.");
            } else if (err.message.includes('network') || err.message.includes('offline')) {
              setError("네트워크 연결을 확인해주세요. 오프라인 상태입니다.");
            } else {
              setError(`채팅방 실시간 구독 오류: ${err.message}`);
            }
            setLoading(false);
          }
        );

        console.log("[useAdminChatsRTDB] ✅ Real-time subscription set up successfully");

      } catch (error: any) {
        console.error("[useAdminChatsRTDB] Realtime Database subscription setup error:", error);
        setError(`Realtime Database 구독 설정 실패: ${error.message}`);
        setLoading(false);
      }
    };

    setupRealtimeSubscription();

    // 컴포넌트 언마운트시 구독 해제
    return () => {
      if (unsubscribe) {
        console.log("[useAdminChatsRTDB] Cleaning up real-time subscription");
        unsubscribe();
      }
    };
  }, [user, authLoading]); // user와 authLoading에 의존

  return {
    chatRooms,
    loading,
    error,
    isAdmin: user?.uid === ADMIN_UID
  };
}