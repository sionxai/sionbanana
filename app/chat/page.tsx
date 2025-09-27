"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { getOrCreateChatRoom } from "@/lib/firebase/chat";
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

      // 20초 타임아웃 설정 (빠른 피드백)
      const timeoutId = setTimeout(() => {
        console.error("[Chat] Initialization timeout after 20 seconds");
        setErrorMessage("채팅방 초기화가 너무 오래 걸리고 있습니다. Firebase 연결에 문제가 있을 수 있습니다. 브라우저를 새로고침하거나 잠시 후 다시 시도해주세요.");
        setInitializing(false);
      }, 20000);

      try {
        console.log("[Chat] Starting enhanced Firebase connection process...");

        // 환경변수 디버깅
        console.log("[Chat] Environment Debug:", {
          NODE_ENV: process.env.NODE_ENV,
          hasApiKey: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
          hasProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          apiKeyPrefix: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.substring(0, 10)
        });

        // 강화된 Firebase 연결 프로세스
        const { ensureFirebaseConnection, firestore, clientEnv } = await import("@/lib/firebase/client");

        console.log("[Chat] Client Environment Check:", {
          apiKey: clientEnv.NEXT_PUBLIC_FIREBASE_API_KEY?.substring(0, 10) + "...",
          projectId: clientEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          authDomain: clientEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          databaseId: clientEnv.NEXT_PUBLIC_FIREBASE_DATABASE_ID
        });

        // 단계 1: 기본 Firestore 인스턴스 확인
        console.log("[Chat] Step 1: Check basic Firestore instance");
        const db = firestore();
        if (!db) {
          throw new Error("Firebase Firestore 인스턴스를 생성할 수 없습니다. 환경변수를 확인해주세요.");
        }
        console.log("[Chat] Firestore instance created successfully");

        // 단계 2: 간단한 Firebase 테스트
        console.log("[Chat] Step 2: Testing basic Firebase connection");
        try {
          // 가장 간단한 Firebase 작업 시도
          const { doc, getDoc } = await import("firebase/firestore");
          const testDoc = doc(db, "test", "connection-test");
          console.log("[Chat] Attempting basic Firebase operation...");

          const testSnap = await getDoc(testDoc);
          console.log("[Chat] Basic Firebase operation successful, exists:", testSnap.exists());
        } catch (firebaseError: any) {
          console.error("[Chat] Basic Firebase operation failed:", firebaseError);
          throw new Error(`Firebase 연결 실패: ${firebaseError.message}`);
        }

        // 단계 3: 채팅방 생성/조회 (하이브리드 SDK + REST API)
        console.log("[Chat] Step 3: Creating/getting chat room with hybrid approach");
        const chatRoomId = await getOrCreateChatRoom(
          user.uid,
          user.displayName || user.email || "사용자"
        );
        console.log("[Chat] Successfully created/got chat room via hybrid approach:", chatRoomId);
        setChatId(chatRoomId);
        clearTimeout(timeoutId);
      } catch (error) {
        console.error("Failed to initialize chat:", error);
        clearTimeout(timeoutId);
        // Firebase 초기화 에러인 경우 더 자세한 로그
        if (error instanceof Error) {
          console.error("Chat initialization error details:", {
            message: error.message,
            stack: error.stack,
            userId: user.uid,
            userDisplayName: user.displayName,
            userEmail: user.email,
            name: error.name,
            cause: (error as any).cause
          });

          // 더 자세한 에러 메시지 표시
          let detailedErrorMessage = error.message;

          // 하이브리드 접근법 실패인 경우 특별한 안내
          if (error.message.includes("SDK") && error.message.includes("REST")) {
            detailedErrorMessage = "Firebase 연결에 심각한 문제가 발생했습니다.\n\n";
            detailedErrorMessage += "SDK와 REST API 모두 실패했습니다:\n";
            detailedErrorMessage += `${error.message}\n\n`;
            detailedErrorMessage += "해결 방법:\n";
            detailedErrorMessage += "1. 인터넷 연결 상태 확인\n";
            detailedErrorMessage += "2. VPN 사용중이라면 비활성화\n";
            detailedErrorMessage += "3. 브라우저 캐시 및 쿠키 삭제\n";
            detailedErrorMessage += "4. 시크릿/프라이빗 브라우징 모드로 시도\n";
            detailedErrorMessage += "5. 다른 브라우저에서 시도";
          } else if (error.message.includes("Firebase")) {
            detailedErrorMessage += "\n\nFirebase 설정을 확인해주세요:";
            detailedErrorMessage += "\n- 프로젝트 ID가 올바른지 확인";
            detailedErrorMessage += "\n- API 키가 유효한지 확인";
            detailedErrorMessage += "\n- Firestore 데이터베이스가 활성화되었는지 확인";
          }
          setErrorMessage(detailedErrorMessage);
        } else {
          console.error("Chat initialization unknown error:", error);
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
      <div className="flex-1 pb-20">
        {chatId ? (
          <ChatInterface
            chatId={chatId}
            currentUserId={user.uid}
            currentUserName={user.displayName || user.email || "사용자"}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-4">
            <Card className="w-full max-w-md">
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