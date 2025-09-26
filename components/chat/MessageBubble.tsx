"use client";

import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface MessageBubbleProps {
  message: ChatMessage;
  isOwnMessage: boolean;
  isAdmin: boolean;
}

export function MessageBubble({ message, isOwnMessage, isAdmin }: MessageBubbleProps) {
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  };

  return (
    <div className={cn("flex gap-3", isOwnMessage ? "flex-row-reverse" : "flex-row")}>
      {/* 아바타 */}
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarFallback className={cn(
          "text-xs font-medium",
          isAdmin ? "bg-primary text-primary-foreground" : "bg-muted"
        )}>
          {isAdmin ? "관" : message.senderName?.[0] || "U"}
        </AvatarFallback>
      </Avatar>

      {/* 메시지 콘텐츠 */}
      <div className={cn("flex max-w-[75%] flex-col", isOwnMessage ? "items-end" : "items-start")}>
        {/* 발신자 이름 */}
        {!isOwnMessage && (
          <div className="mb-1 text-xs text-muted-foreground">
            {isAdmin ? "관리자" : message.senderName}
          </div>
        )}

        {/* 메시지 버블 */}
        <div
          className={cn(
            "rounded-2xl px-4 py-2 text-sm",
            isOwnMessage
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground",
            isAdmin && !isOwnMessage
              ? "bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100"
              : ""
          )}
        >
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>

        {/* 시간 */}
        <div className="mt-1 text-xs text-muted-foreground">
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}