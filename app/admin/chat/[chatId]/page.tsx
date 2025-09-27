"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { chatDocRef } from "@/lib/firebase/chat";
import { getDoc } from "firebase/firestore";
import { ADMIN_UID } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { StudioNavigation } from "@/components/studio/studio-navigation";
import type { ChatRoom } from "@/lib/types";
import Link from "next/link";

// 백업용 임시 데이터
const fallbackChatRooms: Record<string, any> = {
  "user123_ACHNkfU8GNT5u8AtGNP0UsszqIR2": {
    id: "user123_ACHNkfU8GNT5u8AtGNP0UsszqIR2",
    participants: ["user123", ADMIN_UID],
    participantNames: { "user123": "김사용자", [ADMIN_UID]: "관리자" },
    lastMessage: "안녕하세요, 계정 문제로 문의드립니다.",
    lastMessageAt: "2024-03-20T10:30:00Z",
    unreadCount: { [ADMIN_UID]: 2, "user123": 0 },
    userInfo: {
      email: "kim@example.com",
      plan: "basic",
      joinedAt: "2024-01-15T09:00:00Z",
      lastActive: "2024-03-20T10:25:00Z"
    }
  },
  "user456_ACHNkfU8GNT5u8AtGNP0UsszqIR2": {
    id: "user456_ACHNkfU8GNT5u8AtGNP0UsszqIR2",
    participants: ["user456", ADMIN_UID],
    participantNames: { "user456": "이고객", [ADMIN_UID]: "관리자" },
    lastMessage: "네, 감사합니다!",
    lastMessageAt: "2024-03-20T09:15:00Z",
    unreadCount: { [ADMIN_UID]: 0, "user456": 0 },
    userInfo: {
      email: "lee@example.com",
      plan: "premium",
      joinedAt: "2024-02-01T14:30:00Z",
      lastActive: "2024-03-20T09:10:00Z"
    }
  }
};

export default function AdminChatDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading } = useAuth();
  const chatId = params.chatId as string;
  const [chatRoom, setChatRoom] = useState<any>(null);
  const [loadingChat, setLoadingChat] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // 실제 Firebase에서 채팅방 데이터 가져오기
  useEffect(() => {
    const loadChatRoom = async () => {
      if (!chatId) return;

      try {
        console.log("[AdminChatDetail] Loading chat room:", chatId);
        const chatDocReference = chatDocRef(chatId);
        const chatSnap = await getDoc(chatDocReference);

        if (chatSnap.exists()) {
          const data = chatSnap.data();
          const chatRoomData = {
            id: chatSnap.id,
            participants: data.participants,
            participantNames: data.participantNames,
            lastMessage: data.lastMessage,
            lastMessageAt: data.lastMessageAt?.toDate?.()?.toISOString() || data.lastMessageAt,
            unreadCount: data.unreadCount || {},
            createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
            updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
            // 사용자 정보 (임시)
            userInfo: {
              email: "user@example.com",
              plan: "basic",
              joinedAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
              lastActive: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt
            }
          };
          console.log("[AdminChatDetail] Chat room loaded:", chatRoomData);
          setChatRoom(chatRoomData);
        } else {
          console.log("[AdminChatDetail] Chat room not found:", chatId);
          setChatRoom(null);
        }
      } catch (error) {
        console.error("[AdminChatDetail] Error loading chat room:", error);
        setChatRoom(null);
      } finally {
        setLoadingChat(false);
      }
    };

    loadChatRoom();
  }, [chatId]);

  const getUserName = (chatRoom: any) => {
    const userId = chatRoom.participants.find((id: string) => id !== ADMIN_UID);
    return chatRoom.participantNames[userId] || "알 수 없는 사용자";
  };

  const getUserId = (chatRoom: any) => {
    return chatRoom.participants.find((id: string) => id !== ADMIN_UID);
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString("ko-KR");
  };

  if (loading || loadingChat) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-sm text-muted-foreground">
          채팅을 불러오고 있습니다...
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

  if (!chatRoom) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>채팅방을 찾을 수 없음</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              요청하신 채팅방이 존재하지 않습니다.
            </p>
            <Button asChild>
              <Link href="/admin/chat">채팅 목록으로 돌아가기</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const userName = getUserName(chatRoom);
  const userId = getUserId(chatRoom);

  return (
    <div className="flex min-h-screen bg-background flex-col">
      <div className="flex flex-1 overflow-hidden">
        {/* 사이드바 - 사용자 정보 */}
        <div className={`border-r bg-muted/30 transition-all duration-300 ${
          sidebarCollapsed ? "w-0 overflow-hidden" : "w-80"
        }`}>
        <div className="p-4 space-y-4">
          {/* 헤더 */}
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">사용자 정보</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarCollapsed(true)}
            >
              ←
            </Button>
          </div>

          {/* 사용자 기본 정보 */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {userName[0]}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-medium">{userName}</h3>
                  <p className="text-sm text-muted-foreground">{chatRoom.userInfo.email}</p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">사용자 ID:</span>
                  <span className="font-mono text-xs">{userId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">플랜:</span>
                  <Badge variant="secondary">{chatRoom.userInfo.plan}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">가입일:</span>
                  <span>{formatDate(chatRoom.userInfo.joinedAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">최근 활동:</span>
                  <span>{formatDate(chatRoom.userInfo.lastActive)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 관리 도구 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">관리 도구</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-2">
              <Button variant="outline" size="sm" className="w-full justify-start">
                사용자 프로필 보기
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start">
                생성 기록 확인
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start">
                크레딧 조정
              </Button>
            </CardContent>
          </Card>

          {/* 채팅 통계 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">채팅 통계</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">시작일:</span>
                <span>{formatDate(chatRoom.lastMessageAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">읽지 않은 메시지:</span>
                <Badge variant={chatRoom.unreadCount[ADMIN_UID] > 0 ? "destructive" : "secondary"}>
                  {chatRoom.unreadCount[ADMIN_UID] || 0}개
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 메인 채팅 영역 */}
      <div className="flex-1 flex flex-col">
        {/* 채팅 헤더 */}
        <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-16 items-center justify-between px-4">
            <div className="flex items-center gap-3">
              {sidebarCollapsed && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSidebarCollapsed(false)}
                >
                  →
                </Button>
              )}
              <Link href="/admin/chat" className="text-muted-foreground hover:text-foreground">
                ← 채팅 목록
              </Link>
              <div className="h-6 w-px bg-border" />
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                    {userName[0]}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h1 className="font-medium">{userName}</h1>
                  <p className="text-xs text-muted-foreground">
                    {chatRoom.userInfo.plan} 플랜
                  </p>
                </div>
              </div>
            </div>
            <Badge variant="outline">관리자 모드</Badge>
          </div>
        </div>

        {/* 채팅 인터페이스 */}
        <div className="flex-1">
          <ChatInterface
            chatId={chatId}
            currentUserId={ADMIN_UID}
            currentUserName="관리자"
          />
        </div>
      </div>
      </div>

      {/* 하단 네비게이션 */}
      <StudioNavigation />
    </div>
  );
}