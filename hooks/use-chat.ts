"use client";

import { useState, useEffect, useCallback } from "react";
import {
  subscribeToMessagesRTDB,
  sendMessageRTDB,
  markChatAsReadRTDB
} from "@/lib/firebase/realtime-messages";
import { subscribeToAdminChatRoomsRTDB } from "@/lib/firebase/realtime-chat-sdk";
import { ADMIN_UID } from "@/lib/constants";
import type { ChatMessage, ChatRoom } from "@/lib/types";

interface UseChatOptions {
  onNewMessage?: (message: ChatMessage) => void;
}

export function useChat(chatId: string, options: UseChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 실시간 메시지 구독
  useEffect(() => {
    if (!chatId) return;

    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToMessagesRTDB(
      chatId,
      (newMessages) => {
        const normalizedMessages = newMessages.map((message) => {
          const timestampNumber = Number(message.timestamp);
          const timestampIso = Number.isFinite(timestampNumber)
            ? new Date(timestampNumber).toISOString()
            : (typeof message.timestamp === "string" && !Number.isNaN(Date.parse(message.timestamp))
              ? new Date(message.timestamp).toISOString()
              : new Date().toISOString());

          return {
            ...message,
            timestamp: timestampIso,
            readBy: message.readBy ?? {}
          };
        });

        setMessages(normalizedMessages);
        setLoading(false);

        if (options.onNewMessage && normalizedMessages.length > 0) {
          const latestMessage = normalizedMessages[normalizedMessages.length - 1];
          options.onNewMessage(latestMessage);
        }
      },
      (err) => {
        console.error("[useChat] subscribeToMessagesRTDB error:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [chatId, options.onNewMessage]);

  // 메시지 전송
  const sendMessage = useCallback(async (
    senderId: string,
    senderName: string,
    content: string
  ) => {
    try {
      await sendMessageRTDB(chatId, senderId, senderName, content);
    } catch (err) {
      console.error("Failed to send message:", err);
      setError("메시지 전송에 실패했습니다.");
      throw err;
    }
  }, [chatId]);

  // 메시지 읽음 처리
  const markAsRead = useCallback(async (userId: string) => {
    try {
      await markChatAsReadRTDB(chatId, userId);
    } catch (err) {
      console.error("Failed to mark chat as read:", err);
    }
  }, [chatId]);

  // 읽지 않은 메시지 개수
  const getUnreadCount = useCallback((userId: string) => {
    return messages.filter(msg =>
      msg.senderId !== userId &&
      !msg.readBy[userId]
    ).length;
  }, [messages]);

  return {
    messages,
    loading,
    error,
    sendMessage,
    markAsRead,
    getUnreadCount
  };
}

// 관리자용 모든 채팅방 관리 훅
export function useAdminChats() {
  const [chatRooms, setChatRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    console.log("[useAdminChats] Starting RTDB subscription for admin:", ADMIN_UID);

    const unsubscribe = subscribeToAdminChatRoomsRTDB(
      ADMIN_UID,
      (rooms: any[]) => {
        const toIso = (value: any) => {
          const numeric = Number(value);
          if (Number.isFinite(numeric)) {
            return new Date(numeric).toISOString();
          }
          if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
            return new Date(value).toISOString();
          }
          return new Date().toISOString();
        };

        const normalizedRooms = rooms.map((room) => {
          return {
            ...room,
            participants: room.participants ?? [],
            participantNames: room.participantNames ?? {},
            unreadCount: room.unreadCount ?? {},
            lastMessageAt: room.lastMessageAt ? toIso(room.lastMessageAt) : undefined,
            createdAt: room.createdAt ? toIso(room.createdAt) : new Date().toISOString(),
            updatedAt: room.updatedAt ? toIso(room.updatedAt) : new Date().toISOString()
          } as ChatRoom;
        });

        console.log("[useAdminChats] Received RTDB chat rooms:", normalizedRooms);
        setChatRooms(normalizedRooms);
        setLoading(false);
      },
      (err) => {
        console.error("[useAdminChats] RTDB subscription error:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => {
      console.log("[useAdminChats] Unsubscribing from chat rooms");
      unsubscribe();
    };
  }, []);

  return {
    chatRooms,
    loading,
    error
  };
}
