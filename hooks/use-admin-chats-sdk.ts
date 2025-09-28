// Firebase SDK 기반 관리자 채팅 훅 (인증 의존성 해결)
"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { ADMIN_UID } from "@/lib/constants";
import type { ChatRoom } from "@/lib/types";

export function useAdminChatsSDK() {
  const { user, loading: authLoading } = useAuth();
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadChatRooms = async () => {
      // 인증이 완료될 때까지 대기
      if (authLoading) {
        console.log("[useAdminChatsSDK] Waiting for auth to complete...");
        return;
      }

      // 관리자 권한 확인
      if (!user || user.uid !== ADMIN_UID) {
        console.log("[useAdminChatsSDK] User is not admin or not authenticated");
        setLoading(false);
        setError("관리자 권한이 필요합니다");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        console.log("[useAdminChatsSDK] Loading admin chat rooms with Firebase SDK for:", user.uid);

        // Firebase SDK 동적 import (클라이언트 측에서만)
        const { firestore } = await import("@/lib/firebase/client");
        const { collection, query, where, onSnapshot, orderBy } = await import("firebase/firestore");

        const db = firestore();

        // 관리자가 참여한 채팅방만 쿼리 (최적화된 방식)
        const chatQuery = query(
          collection(db, "chats"),
          where("participants", "array-contains", ADMIN_UID),
          orderBy("updatedAt", "desc")
        );

        console.log("[useAdminChatsSDK] Setting up real-time listener for admin chats");

        // 실시간 리스너 설정
        const unsubscribe = onSnapshot(
          chatQuery,
          (snapshot) => {
            console.log("[useAdminChatsSDK] Received snapshot update, docs:", snapshot.docs.length);

            const rooms = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            })) as ChatRoom[];

            console.log("[useAdminChatsSDK] Processed chat rooms:", rooms);
            setChatRooms(rooms);
            setLoading(false);
          },
          (err) => {
            console.error("[useAdminChatsSDK] Firestore listener error:", err);

            // 네트워크 오류 처리
            if (err.code === 'unavailable') {
              setError("네트워크 연결을 확인해주세요. 오프라인 상태입니다.");
            } else if (err.code === 'permission-denied') {
              setError("Firestore 권한이 거부되었습니다. 인증 상태를 확인해주세요.");
            } else {
              setError(`채팅방 로딩 오류: ${err.message}`);
            }
            setLoading(false);
          }
        );

        // 컴포넌트 언마운트시 리스너 정리
        return () => {
          console.log("[useAdminChatsSDK] Cleaning up real-time listener");
          unsubscribe();
        };

      } catch (error: any) {
        console.error("[useAdminChatsSDK] Firebase SDK initialization error:", error);
        setError(`Firebase 초기화 실패: ${error.message}`);
        setLoading(false);
      }
    };

    const cleanup = loadChatRooms();

    // cleanup 함수가 있다면 컴포넌트 언마운트시 실행
    return () => {
      if (cleanup && typeof cleanup.then === 'function') {
        cleanup.then(fn => fn && fn());
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