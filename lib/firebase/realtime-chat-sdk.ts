// Firebase Realtime Database 기반 채팅 기능
import { ADMIN_UID } from "@/lib/constants";

// 사용자의 채팅방 ID 생성
export function generateChatId(userId: string): string {
  return `${userId}_${ADMIN_UID}`;
}

// 채팅방 생성 또는 가져오기 (Realtime Database 버전)
export async function getOrCreateChatRoomRTDB(userId: string, userName: string): Promise<string> {
  const chatId = generateChatId(userId);
  console.log("[getOrCreateChatRoomRTDB] Starting with chatId:", chatId, "userId:", userId, "userName:", userName);

  try {
    // Firebase Realtime Database 동적 import
    const { realtimeDatabase } = await import("@/lib/firebase/client");
    const { ref, get, set, serverTimestamp } = await import("firebase/database");

    const db = realtimeDatabase();
    if (!db) {
      throw new Error("Realtime Database 초기화에 실패했습니다");
    }

    const chatRef = ref(db, `chats/${chatId}`);

    console.log("[getOrCreateChatRoomRTDB] Checking if chat room exists...");

    // 채팅방 존재 확인
    const chatSnapshot = await get(chatRef);

    if (chatSnapshot.exists()) {
      console.log("[getOrCreateChatRoomRTDB] Chat room already exists");
      return chatId;
    }

    // 새 채팅방 생성
    console.log("[getOrCreateChatRoomRTDB] Creating new chat room...");

    const chatData = {
      participants: {
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

    await set(chatRef, chatData);
    console.log("[getOrCreateChatRoomRTDB] ✅ Successfully created chat room:", chatId);

    return chatId;

  } catch (error: any) {
    console.error("[getOrCreateChatRoomRTDB] Error:", error);

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

// 채팅방 정보 조회 (Realtime Database 버전)
export async function getChatRoomRTDB(chatId: string): Promise<any | null> {
  try {
    console.log("[getChatRoomRTDB] Fetching chat room:", chatId);

    const { realtimeDatabase } = await import("@/lib/firebase/client");
    const { ref, get } = await import("firebase/database");

    const db = realtimeDatabase();
    if (!db) {
      console.error("[getChatRoomRTDB] Realtime Database is null");
      return null;
    }

    const chatRef = ref(db, `chats/${chatId}`);
    const chatSnapshot = await get(chatRef);

    if (chatSnapshot.exists()) {
      console.log("[getChatRoomRTDB] Chat room found");
      return {
        id: chatId,
        ...chatSnapshot.val()
      };
    } else {
      console.log("[getChatRoomRTDB] Chat room not found");
      return null;
    }

  } catch (error: any) {
    console.error("[getChatRoomRTDB] Error fetching chat room:", error);
    return null;
  }
}

// 관리자용 채팅방 목록 조회 (Realtime Database 버전)
export async function getAdminChatRoomsRTDB(adminId: string): Promise<any[]> {
  try {
    console.log('[getAdminChatRoomsRTDB] Fetching admin chat rooms for:', adminId);

    const { realtimeDatabase } = await import("@/lib/firebase/client");
    const { ref, get, query, orderByChild, equalTo } = await import("firebase/database");

    const db = realtimeDatabase();
    if (!db) {
      throw new Error("Realtime Database 초기화에 실패했습니다");
    }

    const chatsRef = ref(db, 'chats');

    console.log('[getAdminChatRoomsRTDB] Loading all chat rooms...');

    // 모든 채팅방 가져오기
    const snapshot = await get(chatsRef);

    if (!snapshot.exists()) {
      console.log('[getAdminChatRoomsRTDB] No chat rooms found');
      return [];
    }

    const allChats = snapshot.val();
    const adminChatRooms: any[] = [];

    // 관리자가 참여한 채팅방만 필터링
    for (const [chatId, chatData] of Object.entries(allChats as Record<string, any>)) {
      if (chatData.participants && chatData.participants[adminId]) {
        adminChatRooms.push({
          id: chatId,
          ...chatData,
          // participants를 배열 형태로 변환 (기존 코드 호환성)
          participantNames: chatData.participants,
          participants: Object.keys(chatData.participants)
        });
        console.log('[getAdminChatRoomsRTDB] Found admin chat room:', chatId);
      }
    }

    // 최신 메시지 기준으로 정렬
    adminChatRooms.sort((a, b) => {
      const aTime = a.lastMessageAt || a.updatedAt || a.createdAt || 0;
      const bTime = b.lastMessageAt || b.updatedAt || b.createdAt || 0;
      return bTime - aTime;
    });

    console.log('[getAdminChatRoomsRTDB] Found admin chat rooms:', adminChatRooms.length);
    return adminChatRooms;

  } catch (error: any) {
    console.error('[getAdminChatRoomsRTDB] Failed to fetch admin chat rooms:', error);
    throw new Error(`관리자 채팅방 목록 조회 실패: ${error.message}`);
  }
}

// 실시간 채팅방 목록 구독 (Realtime Database 버전)
export function subscribeToAdminChatRoomsRTDB(
  adminId: string,
  callback: (chatRooms: any[]) => void,
  errorCallback?: (error: Error) => void
): () => void {
  console.log('[subscribeToAdminChatRoomsRTDB] Setting up real-time subscription for:', adminId);

  let unsubscribe: (() => void) | null = null;

  const setupSubscription = async () => {
    try {
      const { realtimeDatabase } = await import("@/lib/firebase/client");
      const { ref, onValue, off } = await import("firebase/database");

      const db = realtimeDatabase();
      if (!db) {
        throw new Error("Realtime Database 초기화에 실패했습니다");
      }

      const chatsRef = ref(db, 'chats');

      console.log('[subscribeToAdminChatRoomsRTDB] Setting up onValue listener...');

      const listener = onValue(
        chatsRef,
        (snapshot) => {
          console.log('[subscribeToAdminChatRoomsRTDB] Received data update');

          if (!snapshot.exists()) {
            console.log('[subscribeToAdminChatRoomsRTDB] No chat rooms found');
            callback([]);
            return;
          }

          const allChats = snapshot.val();
          const adminChatRooms: any[] = [];

          // 관리자가 참여한 채팅방만 필터링
          for (const [chatId, chatData] of Object.entries(allChats as Record<string, any>)) {
            if (chatData.participants && chatData.participants[adminId]) {
              adminChatRooms.push({
                id: chatId,
                ...chatData,
                // participants를 배열 형태로 변환 (기존 코드 호환성)
                participantNames: chatData.participants,
                participants: Object.keys(chatData.participants)
              });
            }
          }

          // 최신 메시지 기준으로 정렬
          adminChatRooms.sort((a, b) => {
            const aTime = a.lastMessageAt || a.updatedAt || a.createdAt || 0;
            const bTime = b.lastMessageAt || b.updatedAt || b.createdAt || 0;
            return bTime - aTime;
          });

          console.log('[subscribeToAdminChatRoomsRTDB] ✅ Real-time update processed, found:', adminChatRooms.length, 'chat rooms');
          callback(adminChatRooms);
        },
        (error) => {
          console.error('[subscribeToAdminChatRoomsRTDB] Real-time listener error:', error);
          if (errorCallback) {
            errorCallback(new Error(`실시간 채팅방 구독 오류: ${error.message}`));
          }
        }
      );

      unsubscribe = () => {
        console.log('[subscribeToAdminChatRoomsRTDB] Unsubscribing from real-time updates');
        off(chatsRef, 'value', listener);
      };

    } catch (error: any) {
      console.error('[subscribeToAdminChatRoomsRTDB] Setup error:', error);
      if (errorCallback) {
        errorCallback(new Error(`실시간 구독 설정 실패: ${error.message}`));
      }
    }
  };

  setupSubscription();

  // cleanup 함수 반환
  return () => {
    if (unsubscribe) {
      unsubscribe();
    }
  };
}