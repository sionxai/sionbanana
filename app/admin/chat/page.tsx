"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { useAdminChatsRest } from "@/hooks/use-chat-rest";
import { ADMIN_UID } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StudioNavigation } from "@/components/studio/studio-navigation";
import type { ChatRoom } from "@/lib/types";
import Link from "next/link";

// 백업용 임시 데이터
const fallbackChatRooms = [
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

export default function AdminChatPage() {
  const { user, loading } = useAuth();
  const { chatRooms, loading: loadingChats, error } = useAdminChatsRest();

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

    return date.toLocaleDateString("ko-KR", {
      month: "short",
      day: "numeric"
    });
  };

  const getUserName = (chatRoom: any) => {
    const userId = chatRoom.participants.find((id: string) => id !== ADMIN_UID);
    return chatRoom.participantNames[userId] || "알 수 없는 사용자";
  };

  const getUserId = (chatRoom: any) => {
    return chatRoom.participants.find((id: string) => id !== ADMIN_UID);
  };

  const getUnreadCount = (chatRoom: any) => {
    return chatRoom.unreadCount[ADMIN_UID] || 0;
  };

  // REST API를 통한 채팅방 데이터 로딩 (useAdminChatsRest 훅에서 처리됨)

  const totalUnreadCount = chatRooms.reduce((sum, chat) => sum + getUnreadCount(chat), 0);

  if (loading || loadingChats) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-sm text-muted-foreground">
          채팅 목록을 불러오고 있습니다...
        </div>
      </div>
    );
  }

  if (!user || user.uid !== ADMIN_UID) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>접근 권한 없음</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              관리자만 접근할 수 있는 페이지입니다.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* 헤더 */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-muted-foreground hover:text-foreground">
              ← 관리자 콘솔
            </Link>
            <div className="h-6 w-px bg-border" />
            <h1 className="text-lg font-semibold">1:1 상담 관리</h1>
          </div>
          <Badge variant={totalUnreadCount > 0 ? "destructive" : "secondary"}>
            {totalUnreadCount > 0 ? `${totalUnreadCount}개 읽지 않음` : "모두 읽음"}
          </Badge>
        </div>
      </div>

      {/* 채팅방 목록 */}
      <ScrollArea className="flex-1 pb-20">
        <div className="p-4">
          {error ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="mb-4 text-4xl">⚠️</div>
                <h3 className="mb-2 text-lg font-semibold">채팅방 목록 로딩 오류</h3>
                <p className="text-center text-muted-foreground mb-4">
                  {error}
                </p>
                <Button onClick={() => window.location.reload()}>
                  다시 시도
                </Button>
              </CardContent>
            </Card>
          ) : chatRooms.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="mb-4 text-4xl">💬</div>
                <h3 className="mb-2 text-lg font-semibold">상담 요청이 없습니다</h3>
                <p className="text-center text-muted-foreground mb-4">
                  사용자가 1:1 상담을 요청하면<br />
                  여기에 채팅방이 표시됩니다.
                </p>
                <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-md max-w-md">
                  <p className="text-sm text-yellow-800">
                    💡 <strong>참고:</strong> 현재 REST API 기반으로 동작하며,
                    사용자가 채팅을 시작하면 해당 브라우저의 localStorage에
                    저장된 채팅방이 여기에 표시됩니다.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {chatRooms.map((chatRoom) => {
                const unreadCount = getUnreadCount(chatRoom);
                const userName = getUserName(chatRoom);
                const userId = getUserId(chatRoom);

                return (
                  <Card
                    key={chatRoom.id}
                    className={`transition-colors hover:bg-muted/50 ${
                      unreadCount > 0 ? "bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800" : ""
                    }`}
                  >
                    <CardContent className="p-4">
                      <Link href={`/admin/chat/${chatRoom.id}`}>
                        <div className="flex items-start gap-3">
                          {/* 사용자 아바타 */}
                          <Avatar className="h-12 w-12 flex-shrink-0">
                            <AvatarFallback className="bg-primary text-primary-foreground">
                              {userName[0]}
                            </AvatarFallback>
                          </Avatar>

                          {/* 채팅 내용 */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <h3 className="font-medium">{userName}</h3>
                                {unreadCount > 0 && (
                                  <Badge variant="destructive" className="text-xs">
                                    {unreadCount}
                                  </Badge>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {chatRoom.lastMessageAt ? formatTime(chatRoom.lastMessageAt) : '메시지 없음'}
                              </span>
                            </div>

                            <p className="text-sm text-muted-foreground mt-1 truncate">
                              {chatRoom.lastMessage || "대화를 시작해보세요"}
                            </p>

                            <p className="text-xs text-muted-foreground mt-1">
                              사용자 ID: {userId}
                            </p>
                          </div>

                          {/* 화살표 */}
                          <div className="flex-shrink-0 text-muted-foreground">
                            →
                          </div>
                        </div>
                      </Link>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* 하단 통계 */}
      <div className="border-t bg-muted/30 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            총 {chatRooms.length}개의 채팅방
          </span>
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin">관리자 콘솔로 돌아가기</Link>
          </Button>
        </div>
      </div>

      {/* 하단 네비게이션 */}
      <StudioNavigation />
    </div>
  );
}