// 관리자 채팅 목록을 Realtime Database로 구독하는 훅
"use client";

import { useEffect, useState } from "react";
import { subscribeToAdminChatRoomsRTDB } from "@/lib/firebase/realtime-chat-sdk";
import { ADMIN_UID } from "@/lib/constants";
import type { ChatRoom } from "@/lib/types";

const toIsoString = (value: any) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return new Date(numeric).toISOString();
  }
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
};

export function useAdminChatsRest() {
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToAdminChatRoomsRTDB(
      ADMIN_UID,
      (rooms: any[]) => {
        const normalizedRooms: ChatRoom[] = rooms.map((room) => ({
          ...room,
          participants: room.participants ?? [],
          participantNames: room.participantNames ?? {},
          unreadCount: room.unreadCount ?? {},
          lastMessageAt: room.lastMessageAt ? toIsoString(room.lastMessageAt) : undefined,
          createdAt: room.createdAt ? toIsoString(room.createdAt) : new Date().toISOString(),
          updatedAt: room.updatedAt ? toIsoString(room.updatedAt) : new Date().toISOString()
        }));

        setChatRooms(normalizedRooms);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    chatRooms,
    loading,
    error
  };
}
