// Firebase Realtime Database 기반 메시지 기능
import type { ChatMessage } from "@/lib/types";

// 메시지 전송 (Realtime Database 버전)
export async function sendMessageRTDB(
  chatId: string,
  senderId: string,
  senderName: string,
  content: string
): Promise<void> {
  try {
    console.log("[sendMessageRTDB] Sending message:", { chatId, senderId, content });

    const { realtimeDatabase } = await import("@/lib/firebase/client");
    const { ref, push, set, serverTimestamp, update } = await import("firebase/database");

    const db = realtimeDatabase();
    if (!db) {
      throw new Error("Realtime Database 초기화에 실패했습니다");
    }

    const messageData = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      chatId,
      senderId,
      senderName,
      content,
      timestamp: Date.now(),
      createdAt: Date.now()
    };

    // 메시지를 messages/{chatId} 경로에 저장
    const messagesRef = ref(db, `messages/${chatId}`);
    const newMessageRef = push(messagesRef);

    await set(newMessageRef, messageData);

    // 채팅방 정보 업데이트 (마지막 메시지, 읽지 않은 메시지 수)
    const ADMIN_UID = "ACHNkfU8GNT5u8AtGNP0UsszqIR2";

    // chatId에서 상대방 UID 추출 (chatId는 "admin_user" 또는 "user_admin" 형태)
    // ADMIN_UID를 제거하고 남은 부분이 상대방 UID
    const otherUserId = senderId === ADMIN_UID
      ? chatId.replace(`${ADMIN_UID}_`, "").replace(`_${ADMIN_UID}`, "")
      : ADMIN_UID;

    const chatRef = ref(db, `chats/${chatId}`);
    const chatUpdates = {
      lastMessage: content,
      lastMessageAt: Date.now(),
      updatedAt: Date.now(),
      // 보낸 사람이 아닌 다른 참여자의 읽지 않은 메시지 수 증가
      [`unreadCount/${otherUserId}`]: await getUnreadCount(chatId, otherUserId) + 1
    };

    await update(chatRef, chatUpdates);

    console.log("[sendMessageRTDB] ✅ Message sent successfully");

  } catch (error: any) {
    console.error("[sendMessageRTDB] Error sending message:", error);
    throw new Error(`메시지 전송 실패: ${error.message}`);
  }
}

// 읽지 않은 메시지 수 조회
async function getUnreadCount(chatId: string, userId: string): Promise<number> {
  try {
    const { realtimeDatabase } = await import("@/lib/firebase/client");
    const { ref, get } = await import("firebase/database");

    const db = realtimeDatabase();
    if (!db) return 0;

    const unreadRef = ref(db, `chats/${chatId}/unreadCount/${userId}`);
    const snapshot = await get(unreadRef);

    return snapshot.exists() ? snapshot.val() : 0;
  } catch (error) {
    console.warn("[getUnreadCount] Error:", error);
    return 0;
  }
}

// 메시지 목록 조회 (Realtime Database 버전)
export async function getMessagesRTDB(chatId: string): Promise<ChatMessage[]> {
  try {
    console.log("[getMessagesRTDB] Fetching messages for chat:", chatId);

    const { realtimeDatabase } = await import("@/lib/firebase/client");
    const { ref, get, query, orderByChild } = await import("firebase/database");

    const db = realtimeDatabase();
    if (!db) {
      throw new Error("Realtime Database 초기화에 실패했습니다");
    }

    const messagesRef = ref(db, `messages/${chatId}`);
    const messagesQuery = query(messagesRef, orderByChild('timestamp'));

    const snapshot = await get(messagesQuery);

    if (!snapshot.exists()) {
      console.log("[getMessagesRTDB] No messages found for chat:", chatId);
      return [];
    }

    const messagesData = snapshot.val();
    const messages: ChatMessage[] = Object.entries(messagesData).map(([key, data]: [string, any]) => ({
      id: data.id || key,
      chatId: data.chatId,
      senderId: data.senderId,
      senderName: data.senderName,
      content: data.content,
      timestamp: data.timestamp.toString(),
      readBy: data.readBy || {}
    }));

    // 시간순 정렬
    messages.sort((a, b) => parseInt(a.timestamp) - parseInt(b.timestamp));

    console.log("[getMessagesRTDB] ✅ Found messages:", messages.length);
    return messages;

  } catch (error: any) {
    console.error("[getMessagesRTDB] Error fetching messages:", error);
    return [];
  }
}

// 실시간 메시지 구독 (Realtime Database 버전)
export function subscribeToMessagesRTDB(
  chatId: string,
  callback: (messages: ChatMessage[]) => void,
  errorCallback?: (error: Error) => void
): () => void {
  console.log("[subscribeToMessagesRTDB] Setting up real-time subscription for chat:", chatId);

  let unsubscribe: (() => void) | null = null;

  const setupSubscription = async () => {
    try {
      const { realtimeDatabase } = await import("@/lib/firebase/client");
      const { ref, onValue, off, query, orderByChild } = await import("firebase/database");

      const db = realtimeDatabase();
      if (!db) {
        throw new Error("Realtime Database 초기화에 실패했습니다");
      }

      const messagesRef = ref(db, `messages/${chatId}`);
      const messagesQuery = query(messagesRef, orderByChild('timestamp'));

      console.log("[subscribeToMessagesRTDB] Setting up onValue listener...");

      const listener = onValue(
        messagesQuery,
        (snapshot) => {
          console.log("[subscribeToMessagesRTDB] Received messages update");

          if (!snapshot.exists()) {
            console.log("[subscribeToMessagesRTDB] No messages found");
            callback([]);
            return;
          }

          const messagesData = snapshot.val();
          const messages: ChatMessage[] = Object.entries(messagesData).map(([key, data]: [string, any]) => ({
            id: data.id || key,
            chatId: data.chatId,
            senderId: data.senderId,
            senderName: data.senderName,
            content: data.content,
            timestamp: data.timestamp.toString(),
            readBy: data.readBy || {}
          }));

          // 시간순 정렬
          messages.sort((a, b) => parseInt(a.timestamp) - parseInt(b.timestamp));

          console.log("[subscribeToMessagesRTDB] ✅ Real-time update processed, found:", messages.length, "messages");
          callback(messages);
        },
        (error) => {
          console.error("[subscribeToMessagesRTDB] Real-time listener error:", error);
          if (errorCallback) {
            errorCallback(new Error(`실시간 메시지 구독 오류: ${error.message}`));
          }
        }
      );

      unsubscribe = () => {
        console.log("[subscribeToMessagesRTDB] Unsubscribing from real-time updates");
        off(messagesQuery, 'value', listener);
      };

    } catch (error: any) {
      console.error("[subscribeToMessagesRTDB] Setup error:", error);
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

// 채팅을 읽음으로 표시 (Realtime Database 버전)
export async function markChatAsReadRTDB(chatId: string, userId: string): Promise<void> {
  try {
    console.log("[markChatAsReadRTDB] Marking chat as read:", { chatId, userId });

    const { realtimeDatabase } = await import("@/lib/firebase/client");
    const { ref, update } = await import("firebase/database");

    const db = realtimeDatabase();
    if (!db) {
      throw new Error("Realtime Database 초기화에 실패했습니다");
    }

    const chatRef = ref(db, `chats/${chatId}`);
    const updates = {
      [`unreadCount/${userId}`]: 0
    };

    await update(chatRef, updates);
    console.log("[markChatAsReadRTDB] ✅ Chat marked as read");

  } catch (error: any) {
    console.error("[markChatAsReadRTDB] Error marking chat as read:", error);
    // 읽음 처리 실패는 무시 (중요하지 않은 기능)
  }
}