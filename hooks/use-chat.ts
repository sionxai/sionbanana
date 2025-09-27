"use client";

import { useState, useEffect, useCallback } from "react";
import {
  subscribeToMessages,
  sendMessage as sendChatMessage,
  markChatAsRead
} from "@/lib/firebase/chat";
import type { ChatMessage } from "@/lib/types";

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

    const unsubscribe = subscribeToMessages(chatId, (newMessages) => {
      setMessages(newMessages);
      setLoading(false);

      // 새 메시지 콜백 호출
      if (options.onNewMessage && newMessages.length > 0) {
        const latestMessage = newMessages[newMessages.length - 1];
        options.onNewMessage(latestMessage);
      }
    });

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
      await sendChatMessage(chatId, senderId, senderName, content);
    } catch (err) {
      console.error("Failed to send message:", err);
      setError("메시지 전송에 실패했습니다.");
      throw err;
    }
  }, [chatId]);

  // 메시지 읽음 처리
  const markAsRead = useCallback(async (userId: string) => {
    try {
      await markChatAsRead(chatId, userId);
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
    const { subscribeToChatRooms } = require("@/lib/firebase/chat");
    const { ADMIN_UID } = require("@/lib/constants");

    setLoading(true);
    setError(null);

    console.log("[useAdminChats] Starting subscription for admin:", ADMIN_UID);

    const unsubscribe = subscribeToChatRooms(ADMIN_UID, (rooms) => {
      console.log("[useAdminChats] Received chat rooms:", rooms);
      setChatRooms(rooms);
      setLoading(false);
    });

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