// REST API 전용 채팅 기능 (Firebase SDK 완전 우회)
import { createChatRoomViaRest, getDocumentViaRest } from "@/lib/firebase/rest-api";
import { ADMIN_UID } from "@/lib/constants";

// 사용자의 채팅방 ID 생성 (사용자 ID + 관리자 ID 조합)
export function generateChatId(userId: string): string {
  return `${userId}_${ADMIN_UID}`;
}

// 채팅방 생성 또는 가져오기 (REST API 전용)
export async function getOrCreateChatRoomRestOnly(userId: string, userName: string): Promise<string> {
  const chatId = generateChatId(userId);
  console.log("[getOrCreateChatRoomRestOnly] Starting REST API only approach with chatId:", chatId, "userId:", userId, "userName:", userName);

  try {
    console.log("[getOrCreateChatRoomRestOnly] Using REST API approach (no SDK fallback)...");

    // REST API로 문서 존재 확인
    console.log("[getOrCreateChatRoomRestOnly] Checking if chat room exists via REST API...");
    const existingChat = await getDocumentViaRest('chats', chatId);

    if (!existingChat) {
      console.log("[getOrCreateChatRoomRestOnly] Creating chat room via REST API...");
      await createChatRoomViaRest(userId, userName, ADMIN_UID);
      console.log("[getOrCreateChatRoomRestOnly] Successfully created chat room via REST API");
    } else {
      console.log("[getOrCreateChatRoomRestOnly] Chat room already exists via REST API");
    }

    console.log("[getOrCreateChatRoomRestOnly] Returning chatId from REST API:", chatId);

    // 관리자가 채팅방을 확인할 수 있도록 localStorage에 임시 저장
    try {
      console.log("[getOrCreateChatRoomRestOnly] 💾 Starting localStorage save process for chatId:", chatId);

      const existingChatIds = JSON.parse(localStorage.getItem('recentChatIds') || '[]');
      console.log("[getOrCreateChatRoomRestOnly] 💾 Current localStorage content:", existingChatIds);

      if (!existingChatIds.includes(chatId)) {
        existingChatIds.push(chatId);
        console.log("[getOrCreateChatRoomRestOnly] 💾 Added chatId to array:", existingChatIds);

        // 최대 10개만 보관
        if (existingChatIds.length > 10) {
          existingChatIds.splice(0, existingChatIds.length - 10);
          console.log("[getOrCreateChatRoomRestOnly] 💾 Trimmed to max 10 items:", existingChatIds);
        }

        localStorage.setItem('recentChatIds', JSON.stringify(existingChatIds));
        console.log("[getOrCreateChatRoomRestOnly] 💾 Successfully saved to localStorage");

        // 저장 검증
        const verifyStorage = localStorage.getItem('recentChatIds');
        console.log("[getOrCreateChatRoomRestOnly] 💾 Verification - localStorage now contains:", verifyStorage);
        console.log("[getOrCreateChatRoomRestOnly] 💾 Parsed verification:", JSON.parse(verifyStorage || '[]'));
      } else {
        console.log("[getOrCreateChatRoomRestOnly] 💾 ChatId already exists in localStorage:", chatId);
      }
    } catch (e: any) {
      console.error("[getOrCreateChatRoomRestOnly] ❌ Failed to save to localStorage:", e);
      console.error("[getOrCreateChatRoomRestOnly] ❌ Error details:", {
        name: e?.name,
        message: e?.message,
        stack: e?.stack
      });
    }

    return chatId;

  } catch (restError: any) {
    console.error("[getOrCreateChatRoomRestOnly] REST API failed:", {
      error: restError.message,
      stack: restError.stack
    });

    // REST API 실패시 더 자세한 에러 정보 제공
    throw new Error(`REST API로 채팅방 생성에 실패했습니다. 인터넷 연결을 확인하고 다시 시도해주세요. 오류: ${restError.message}`);
  }
}