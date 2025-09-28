// Realtime Database 기반 채팅 훅
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  subscribeToMessagesRTDB,
  sendMessageRTDB,
  markChatAsReadRTDB
} from "@/lib/firebase/realtime-messages";
import type { ChatMessage } from "@/lib/types";

interface UseChatRTDBOptions {
  onNewMessage?: (message: ChatMessage) => void;
}

export function useChatRTDB(chatId: string, options: UseChatRTDBOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 실시간 메시지 구독
  useEffect(() => {
    if (!chatId) return;

    setLoading(true);
    setError(null);

    console.log("[useChatRTDB] Setting up real-time subscription for chat:", chatId);

    const unsubscribe = subscribeToMessagesRTDB(
      chatId,
      (newMessages) => {
        console.log("[useChatRTDB] Received messages update:", newMessages.length);
        setMessages(newMessages);
        setLoading(false);

        // 새 메시지 콜백 실행
        if (options.onNewMessage && newMessages.length > 0) {
          const latestMessage = newMessages[newMessages.length - 1];
          options.onNewMessage(latestMessage);
        }
      },
      (err) => {
        console.error("[useChatRTDB] Real-time subscription error:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => {
      console.log("[useChatRTDB] Cleaning up real-time subscription");
      unsubscribe();
    };
  }, [chatId, options.onNewMessage]);

  // 메시지 전송
  const sendMessage = useCallback(async (senderId: string, senderName: string, content: string) => {
    try {
      console.log("[useChatRTDB] Sending message:", { senderId, content });
      await sendMessageRTDB(chatId, senderId, senderName, content);
      console.log("[useChatRTDB] ✅ Message sent successfully");
    } catch (error: any) {
      console.error("[useChatRTDB] Failed to send message:", error);
      throw error;
    }
  }, [chatId]);

  // 읽음 표시
  const markAsRead = useCallback(async (userId: string) => {
    try {
      console.log("[useChatRTDB] Marking chat as read for user:", userId);
      await markChatAsReadRTDB(chatId, userId);
      console.log("[useChatRTDB] ✅ Chat marked as read");
    } catch (error: any) {
      console.error("[useChatRTDB] Failed to mark as read:", error);
      // 읽음 처리 실패는 무시
    }
  }, [chatId]);

  return {
    messages,
    loading,
    error,
    sendMessage,
    markAsRead
  };
}