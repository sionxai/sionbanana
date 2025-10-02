"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { MessageBubble } from "./MessageBubble";
import { useChat } from "@/hooks/use-chat";
import { ADMIN_UID } from "@/lib/constants";

interface AdminChatInterfaceProps {
  chatId: string;
  currentUserId: string;
  currentUserName: string;
  otherUserName: string;
  showHeader?: boolean;
}

export function AdminChatInterface({
  chatId,
  currentUserId,
  currentUserName,
  otherUserName,
  showHeader = true
}: AdminChatInterfaceProps) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [isMultiline, setIsMultiline] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, loading, sendMessage, markAsRead } = useChat(chatId);

  // 빠른 답변 템플릿
  const quickReplies = [
    "안녕하세요! 무엇을 도와드릴까요?",
    "문의해주신 내용 확인했습니다. 조금만 기다려주세요.",
    "죄송합니다. 다시 한번 확인해보겠습니다.",
    "문제가 해결되었는지 확인 부탁드립니다.",
    "추가로 궁금한 점이 있으시면 언제든 문의해주세요.",
    "감사합니다. 좋은 하루 되세요!"
  ];

  // 메시지 전송
  const handleSendMessage = async () => {
    if (!message.trim() || sending) return;

    setSending(true);
    try {
      await sendMessage(currentUserId, currentUserName, message.trim());
      setMessage("");
      setIsMultiline(false);
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setSending(false);
    }
  };

  // 빠른 답변 선택
  const handleQuickReply = (reply: string) => {
    setMessage(reply);
  };

  // 엔터키로 메시지 전송 (Shift+Enter는 줄바꿈)
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (e.shiftKey) {
        setIsMultiline(true);
      } else {
        e.preventDefault();
        handleSendMessage();
      }
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
      {showHeader && (
        <div className="border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                {otherUserName}님과의 상담
              </Badge>
              {messages.length > 0 && (
                <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
                  총 {messages.length}개 메시지
                </Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground">관리자 모드 • 실시간 동기화</span>
          </div>
        </div>
      )}

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
              <div className="mb-2 text-lg">💬</div>
              <h3 className="mb-1 font-medium">대화를 시작해보세요</h3>
              <p className="text-sm text-muted-foreground">
                {otherUserName}님이 상담을 요청했습니다. 빠른 답변으로 도움을 드려보세요.
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
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {quickReplies.map((reply, index) => (
            <Button
              key={index}
              variant="outline"
              size="sm"
              onClick={() => handleQuickReply(reply)}
              className="text-xs"
            >
              {reply.length > 20 ? `${reply.substring(0, 20)}...` : reply}
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          {isMultiline ? (
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="메시지를 입력하세요... (Shift+Enter: 줄바꿈, Enter: 전송)"
              disabled={sending}
              className="min-h-[90px] flex-1 resize-none"
              rows={4}
            />
          ) : (
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="메시지를 입력하세요... (Shift+Enter: 줄바꿈)"
              disabled={sending}
              className="flex-1"
            />
          )}
          <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-stretch">
            <Button
              onClick={handleSendMessage}
              disabled={!message.trim() || sending}
              size="sm"
              className="h-9"
            >
              {sending ? "전송 중..." : "전송"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsMultiline(!isMultiline)}
              className="h-9 text-xs"
            >
              {isMultiline ? "단일행" : "여러행"}
            </Button>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          💡 팁: 빠른 답변을 클릭하거나 직접 입력하세요. Shift+Enter로 줄바꿈할 수 있습니다.
        </div>
      </div>
    </div>
  );
}
