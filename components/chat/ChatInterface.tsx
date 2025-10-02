"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CardTitle } from "@/components/ui/card";
import { MessageBubble } from "./MessageBubble";
import { useChat } from "@/hooks/use-chat";
import { ADMIN_UID } from "@/lib/constants";

interface ChatInterfaceProps {
  chatId: string;
  currentUserId: string;
  currentUserName: string;
}

export function ChatInterface({ chatId, currentUserId, currentUserName }: ChatInterfaceProps) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, loading, sendMessage, markAsRead } = useChat(chatId);

  // 메시지 전송
  const handleSendMessage = async () => {
    if (!message.trim() || sending) return;

    setSending(true);
    try {
      await sendMessage(currentUserId, currentUserName, message.trim());
      setMessage("");
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setSending(false);
    }
  };

  // 엔터키로 메시지 전송
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 자동 스크롤
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 메시지 읽음 처리
  useEffect(() => {
    if (messages.length > 0 && currentUserId) {
      markAsRead(currentUserId);
    }
  }, [messages, currentUserId, markAsRead]);

  return (
    <div className="flex h-full flex-col rounded-xl border bg-card shadow-sm">
      <div className="border-b px-4 py-3">
        <CardTitle className="text-base">1:1 상담하기</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          관리자와 실시간으로 소통하세요. 궁금한 점을 언제든 문의해주세요.
        </p>
      </div>

      <ScrollArea className="flex-1 px-4 py-6">
        <div className="space-y-4">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <div className="animate-pulse text-sm text-muted-foreground">
                메시지를 불러오고 있습니다...
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/40 text-center">
              <div className="mb-2 text-lg">👋</div>
              <h3 className="mb-1 font-medium">안녕하세요!</h3>
              <p className="text-sm text-muted-foreground">
                궁금한 점이나 도움이 필요한 일이 있으시면 언제든 메시지를 보내주세요.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isOwnMessage={msg.senderId === currentUserId}
                isAdmin={msg.senderId === ADMIN_UID}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <div className="border-t bg-background px-4 py-3">
        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="메시지를 입력하세요..."
            disabled={sending}
            className="flex-1"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!message.trim() || sending}
            size="sm"
          >
            {sending ? "전송 중..." : "전송"}
          </Button>
        </div>
      </div>
    </div>
  );
}
