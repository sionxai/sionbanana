// Firebase SDK 기반 채팅 기능 (안정적인 버전)
import { ADMIN_UID } from "@/lib/constants";

// 사용자의 채팅방 ID 생성
export function generateChatId(userId: string): string {
  return `${userId}_${ADMIN_UID}`;
}

// 채팅방 생성 또는 가져오기 (Firebase SDK 버전)
export async function getOrCreateChatRoomSDK(userId: string, userName: string): Promise<string> {
  const chatId = generateChatId(userId);
  console.log("[getOrCreateChatRoomSDK] Starting with chatId:", chatId, "userId:", userId, "userName:", userName);

  try {
    // Firebase SDK 동적 import
    const { firestore } = await import("@/lib/firebase/client");
    const { doc, getDoc, setDoc, serverTimestamp } = await import("firebase/firestore");

    const db = firestore();
    const chatRef = doc(db, "chats", chatId);

    console.log("[getOrCreateChatRoomSDK] Checking if chat room exists...");

    // 채팅방 존재 확인
    const chatDoc = await getDoc(chatRef);

    if (chatDoc.exists()) {
      console.log("[getOrCreateChatRoomSDK] Chat room already exists");
      return chatId;
    }

    // 새 채팅방 생성
    console.log("[getOrCreateChatRoomSDK] Creating new chat room...");

    const chatData = {
      participants: [userId, ADMIN_UID],
      participantNames: {
        [userId]: userName,
        [ADMIN_UID]: "관리자"
      },
      unreadCount: {
        [userId]: 0,
        [ADMIN_UID]: 0
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessage: null,
      lastMessageAt: null
    };

    await setDoc(chatRef, chatData);
    console.log("[getOrCreateChatRoomSDK] ✅ Successfully created chat room:", chatId);

    return chatId;

  } catch (error: any) {
    console.error("[getOrCreateChatRoomSDK] Error:", error);

    // 네트워크 오류 처리
    if (error.code === 'unavailable') {
      throw new Error("네트워크 연결을 확인해주세요. 오프라인 상태에서는 채팅방을 생성할 수 없습니다.");
    } else if (error.code === 'permission-denied') {
      throw new Error("채팅방 생성 권한이 없습니다. 로그인 상태를 확인해주세요.");
    } else {
      throw new Error(`채팅방 생성 실패: ${error.message}`);
    }
  }
}

// 채팅방 정보 조회 (Firebase SDK 버전)
export async function getChatRoomSDK(chatId: string): Promise<any | null> {
  try {
    console.log("[getChatRoomSDK] Fetching chat room:", chatId);

    const { firestore } = await import("@/lib/firebase/client");
    const { doc, getDoc } = await import("firebase/firestore");

    const db = firestore();
    const chatRef = doc(db, "chats", chatId);

    const chatDoc = await getDoc(chatRef);

    if (chatDoc.exists()) {
      console.log("[getChatRoomSDK] Chat room found");
      return {
        id: chatId,
        ...chatDoc.data()
      };
    } else {
      console.log("[getChatRoomSDK] Chat room not found");
      return null;
    }

  } catch (error: any) {
    console.error("[getChatRoomSDK] Error fetching chat room:", error);
    return null;
  }
}

// 네트워크 상태 개선 함수
export async function enableFirestoreNetwork() {
  try {
    const { firestore } = await import("@/lib/firebase/client");
    const { enableNetwork } = await import("firebase/firestore");

    const db = firestore();
    await enableNetwork(db);
    console.log("[enableFirestoreNetwork] ✅ Network enabled");
  } catch (error) {
    console.warn("[enableFirestoreNetwork] Failed to enable network:", error);
  }
}

export async function disableFirestoreNetwork() {
  try {
    const { firestore } = await import("@/lib/firebase/client");
    const { disableNetwork } = await import("firebase/firestore");

    const db = firestore();
    await disableNetwork(db);
    console.log("[disableFirestoreNetwork] ✅ Network disabled");
  } catch (error) {
    console.warn("[disableFirestoreNetwork] Failed to disable network:", error);
  }
}