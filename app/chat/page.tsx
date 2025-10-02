"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { getOrCreateChatRoomRTDB } from "@/lib/firebase/realtime-chat-sdk";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { StudioNavigation } from "@/components/studio/studio-navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ADMIN_UID } from "@/lib/constants";

export default function ChatPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [chatId, setChatId] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const initializeChat = async () => {
      if (!user || loading) {
        console.log("[Chat] Waiting for user/auth to load...", { user: !!user, loading });
        return;
      }

      console.log("[Chat] Starting chat initialization for user:", user.uid);

      // 관리자인 경우 관리자 채팅 페이지로 리다이렉트
      if (user.uid === ADMIN_UID) {
        console.log("[Chat] Admin user detected, redirecting to admin chat");
        router.replace("/admin/chat");
        return;
      }

      try {
        console.log("[Chat] Starting Realtime Database chat initialization...");

        // 채팅방 생성/조회 (Realtime Database)
        console.log("[Chat] Creating/getting chat room with Realtime Database");
        const chatRoomId = await getOrCreateChatRoomRTDB(
          user.uid,
          user.displayName || user.email || "사용자"
        );
        console.log("[Chat] ✅ Successfully created/got chat room:", chatRoomId);
        setChatId(chatRoomId);
      } catch (error) {
        console.error("[Chat] Failed to initialize chat:", error);

        if (error instanceof Error) {
          console.error("[Chat] Error details:", {
            message: error.message,
            stack: error.stack,
            userId: user.uid,
            name: error.name
          });

          setErrorMessage(error.message);
        } else {
          console.error("[Chat] Unknown error:", error);
          setErrorMessage(`채팅방을 생성하는 중 알 수 없는 오류가 발생했습니다: ${JSON.stringify(error)}`);
        }
      } finally {
        setInitializing(false);
      }
    };

    initializeChat();
  }, [user, loading, router]);

  if (loading || initializing) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-pulse text-sm text-muted-foreground">
            채팅방을 준비하고 있습니다...
          </div>
        </div>
        <StudioNavigation />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <div className="flex flex-1 items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>로그인이 필요합니다</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                1:1 상담하기 기능을 사용하려면 로그인해주세요.
              </p>
            </CardContent>
          </Card>
        </div>
        <StudioNavigation />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 justify-center px-4 pb-20">
        {chatId ? (
          <div className="w-full max-w-3xl py-6">
            <ChatInterface
              chatId={chatId}
              currentUserId={user.uid}
              currentUserName={user.displayName || user.email || "사용자"}
            />
          </div>
        ) : (
          <div className="flex w-full max-w-2xl items-center justify-center py-12">
            <Card className="w-full">
              <CardHeader>
                <CardTitle className="text-destructive">채팅 오류</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  채팅방을 생성하는 중 오류가 발생했습니다.
                </p>
                {errorMessage && (
                  <div className="bg-muted p-3 rounded-md mb-4">
                    <p className="text-sm text-muted-foreground">
                      오류 상세: {errorMessage}
                    </p>
                  </div>
                )}
                {errorMessage?.includes("offline") && (
                  <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-md">
                    <p className="text-sm text-yellow-800">
                      💡 인터넷 연결을 확인하고 페이지를 새로고침해주세요.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
      <StudioNavigation />
    </div>
  );
}
