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