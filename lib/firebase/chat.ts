import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDocs,
  getDoc,
  query,
  orderBy,
  where,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  DocumentData,
  QuerySnapshot,
  updateDoc,
  increment
} from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import type { ChatMessage, ChatRoom } from "@/lib/types";
import { ADMIN_UID } from "@/lib/constants";

export function chatsCollection() {
  const db = firestore();
  if (!db) throw new Error("Firestore not initialized");
  return collection(db, "chats");
}

export function chatDocRef(chatId: string) {
  const db = firestore();
  if (!db) throw new Error("Firestore not initialized");
  return doc(db, "chats", chatId);
}

export function messagesCollection(chatId: string) {
  const db = firestore();
  if (!db) throw new Error("Firestore not initialized");
  return collection(db, "chats", chatId, "messages");
}

export function messagesQuery(chatId: string) {
  return query(messagesCollection(chatId), orderBy("timestamp", "asc"));
}

export function recentMessagesQuery(chatId: string, limitCount = 50) {
  return query(
    messagesCollection(chatId),
    orderBy("timestamp", "desc"),
    limit(limitCount)
  );
}

// 사용자의 채팅방 ID 생성 (사용자 ID + 관리자 ID 조합)
export function generateChatId(userId: string): string {
  return `${userId}_${ADMIN_UID}`;
}

// 채팅방 생성 또는 가져오기
export async function getOrCreateChatRoom(userId: string, userName: string): Promise<string> {
  const chatId = generateChatId(userId);
  const chatRef = chatDocRef(chatId);

  try {
    const chatSnap = await getDoc(chatRef);

    if (!chatSnap.exists()) {
      // 채팅방이 없으면 새로 생성
      const newChatRoom: Omit<ChatRoom, 'id'> = {
        participants: [userId, ADMIN_UID],
        participantNames: {
          [userId]: userName,
          [ADMIN_UID]: "관리자"
        },
        unreadCount: {
          [userId]: 0,
          [ADMIN_UID]: 0
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await setDoc(chatRef, {
        ...newChatRoom,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    return chatId;
  } catch (error) {
    console.error("Error creating/getting chat room:", error);
    throw error;
  }
}

// 메시지 전송
export async function sendMessage(
  chatId: string,
  senderId: string,
  senderName: string,
  content: string
): Promise<void> {
  try {
    const messagesRef = messagesCollection(chatId);
    const chatRef = chatDocRef(chatId);

    // 메시지 추가
    await addDoc(messagesRef, {
      senderId,
      senderName,
      content,
      timestamp: serverTimestamp(),
      readBy: {
        [senderId]: serverTimestamp()
      }
    });

    // 채팅방 정보 업데이트
    const receiverId = senderId === ADMIN_UID ?
      (await getDoc(chatRef)).data()?.participants.find((id: string) => id !== ADMIN_UID) :
      ADMIN_UID;

    await updateDoc(chatRef, {
      lastMessage: content,
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      [`unreadCount.${receiverId}`]: increment(1)
    });

  } catch (error) {
    console.error("Error sending message:", error);
    throw error;
  }
}

// 메시지 읽음 처리
export async function markMessageAsRead(chatId: string, messageId: string, userId: string): Promise<void> {
  try {
    const messageRef = doc(messagesCollection(chatId), messageId);
    await updateDoc(messageRef, {
      [`readBy.${userId}`]: serverTimestamp()
    });
  } catch (error) {
    console.error("Error marking message as read:", error);
    throw error;
  }
}

// 채팅방의 읽지 않은 메시지 개수 초기화
export async function markChatAsRead(chatId: string, userId: string): Promise<void> {
  try {
    const chatRef = chatDocRef(chatId);
    await updateDoc(chatRef, {
      [`unreadCount.${userId}`]: 0
    });
  } catch (error) {
    console.error("Error marking chat as read:", error);
    throw error;
  }
}

// 관리자용: 모든 채팅방 가져오기
export function adminChatsQuery() {
  return query(
    chatsCollection(),
    where("participants", "array-contains", ADMIN_UID),
    orderBy("updatedAt", "desc")
  );
}

// 실시간 메시지 리스너
export function subscribeToMessages(
  chatId: string,
  callback: (messages: ChatMessage[]) => void
): () => void {
  const q = messagesQuery(chatId);

  return onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
    const messages: ChatMessage[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      messages.push({
        id: doc.id,
        chatId,
        senderId: data.senderId,
        senderName: data.senderName,
        content: data.content,
        timestamp: data.timestamp instanceof Timestamp ?
          data.timestamp.toDate().toISOString() :
          data.timestamp,
        readBy: data.readBy || {}
      });
    });
    callback(messages);
  });
}

// 실시간 채팅방 리스너
export function subscribeToChatRooms(
  userId: string,
  callback: (chatRooms: ChatRoom[]) => void
): () => void {
  const q = query(
    chatsCollection(),
    where("participants", "array-contains", userId),
    orderBy("updatedAt", "desc")
  );

  return onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
    const chatRooms: ChatRoom[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      chatRooms.push({
        id: doc.id,
        participants: data.participants,
        participantNames: data.participantNames,
        lastMessage: data.lastMessage,
        lastMessageAt: data.lastMessageAt instanceof Timestamp ?
          data.lastMessageAt.toDate().toISOString() :
          data.lastMessageAt,
        unreadCount: data.unreadCount || {},
        createdAt: data.createdAt instanceof Timestamp ?
          data.createdAt.toDate().toISOString() :
          data.createdAt,
        updatedAt: data.updatedAt instanceof Timestamp ?
          data.updatedAt.toDate().toISOString() :
          data.updatedAt
      });
    });
    callback(chatRooms);
  });
}