"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { useAdminChatsRTDB } from "@/hooks/use-admin-chats-rtdb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ADMIN_UID } from "@/lib/constants";
import type { ChatRoom } from "@/lib/types";

// 임시 데이터 - 실제로는 Firebase에서 가져와야 함
const mockChatRooms = [
  {
    id: "user123_ACHNkfU8GNT5u8AtGNP0UsszqIR2",
    participants: ["user123", ADMIN_UID],
    participantNames: { "user123": "김사용자", [ADMIN_UID]: "관리자" },
    lastMessage: "안녕하세요, 계정 문제로 문의드립니다.",
    lastMessageAt: "2024-03-20T10:30:00Z",
    unreadCount: { [ADMIN_UID]: 2, "user123": 0 }
  },
  {
    id: "user456_ACHNkfU8GNT5u8AtGNP0UsszqIR2",
    participants: ["user456", ADMIN_UID],
    participantNames: { "user456": "이고객", [ADMIN_UID]: "관리자" },
    lastMessage: "네, 감사합니다!",
    lastMessageAt: "2024-03-20T09:15:00Z",
    unreadCount: { [ADMIN_UID]: 0, "user456": 0 }
  },
  {
    id: "user789_ACHNkfU8GNT5u8AtGNP0UsszqIR2",
    participants: ["user789", ADMIN_UID],
    participantNames: { "user789": "박문의", [ADMIN_UID]: "관리자" },
    lastMessage: "이미지 생성이 안되는데 확인 부탁드립니다.",
    lastMessageAt: "2024-03-20T08:45:00Z",
    unreadCount: { [ADMIN_UID]: 5, "user789": 0 }
  }
];

export default function ChatManagement() {
  const { user } = useAuth();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const { chatRooms, loading, error } = useAdminChatsRTDB();

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "방금 전";
    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays < 7) return `${diffDays}일 전`;

    return date.toLocaleDateString("ko-KR");
  };

  const getUserName = (chatRoom: any) => {
    const userId = chatRoom.participants.find((id: string) => id !== ADMIN_UID);
    return chatRoom.participantNames[userId] || "알 수 없는 사용자";
  };

  const getUnreadCount = (chatRoom: any) => {
    return chatRoom.unreadCount[ADMIN_UID] || 0;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          1:1 상담 관리
          <Badge variant="secondary">
            {chatRooms.length}개 채팅방
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {loading ? (
            <div className="py-4 text-center text-muted-foreground">
              채팅 목록을 불러오고 있습니다...
            </div>
          ) : error ? (
            <div className="py-4 text-center text-destructive">
              채팅 목록을 불러오는 중 오류가 발생했습니다: {error}
            </div>
          ) : chatRooms.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              아직 상담 요청이 없습니다.
            </div>
          ) : (
            chatRooms.map((chatRoom) => {
              const unreadCount = getUnreadCount(chatRoom);
              const userName = getUserName(chatRoom);

              return (
                <div
                  key={chatRoom.id}
                  className={`rounded-lg border p-3 transition-colors hover:bg-muted/50 ${
                    selectedChatId === chatRoom.id ? "bg-muted" : ""
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-sm">{userName}</h4>
                        {unreadCount > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            {unreadCount}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 truncate">
                        {chatRoom.lastMessage}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {chatRoom.lastMessageAt ? formatTime(chatRoom.lastMessageAt) : '메시지 없음'}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      asChild
                    >
                      <Link href={`/admin/chat/${chatRoom.id}`}>
                        답변하기
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {chatRooms.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>총 {chatRooms.filter(chat => getUnreadCount(chat) > 0).length}개의 읽지 않은 대화</span>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/admin/chat">
                  모든 채팅 보기
                </Link>
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}