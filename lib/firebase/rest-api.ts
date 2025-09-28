// Firebase REST API 직접 호출 (Firebase SDK 우회)
import { clientEnv } from "@/lib/env";

const FIRESTORE_REST_BASE = `https://firestore.googleapis.com/v1/projects/${clientEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/databases/(default)/documents`;

// Firebase REST API를 사용한 문서 생성
export async function createDocumentViaRest(
  collection: string,
  documentId: string,
  data: Record<string, any>
): Promise<any> {
  const url = `${FIRESTORE_REST_BASE}/${collection}?documentId=${documentId}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${await getFirebaseToken()}`
    },
    body: JSON.stringify({
      fields: convertToFirestoreFields(data)
    })
  });

  if (!response.ok) {
    throw new Error(`Firebase REST API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Firebase REST API를 사용한 문서 조회
export async function getDocumentViaRest(
  collection: string,
  documentId: string
): Promise<any> {
  const url = `${FIRESTORE_REST_BASE}/${collection}/${documentId}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${await getFirebaseToken()}`
    }
  });

  if (response.status === 404) {
    return null; // 문서가 존재하지 않음
  }

  if (!response.ok) {
    throw new Error(`Firebase REST API error: ${response.status} ${response.statusText}`);
  }

  const doc = await response.json();
  return convertFromFirestoreFields(doc.fields || {});
}

// 데이터를 Firestore REST API 포맷으로 변환
function convertToFirestoreFields(data: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      fields[key] = { stringValue: value };
    } else if (typeof value === 'number') {
      fields[key] = { integerValue: value.toString() };
    } else if (typeof value === 'boolean') {
      fields[key] = { booleanValue: value };
    } else if (Array.isArray(value)) {
      fields[key] = { arrayValue: { values: value.map(v => ({ stringValue: v })) } };
    } else if (value instanceof Date) {
      fields[key] = { timestampValue: value.toISOString() };
    } else if (typeof value === 'object' && value !== null) {
      fields[key] = { mapValue: { fields: convertToFirestoreFields(value) } };
    }
  }

  return fields;
}

// Firestore REST API 포맷에서 일반 데이터로 변환
function convertFromFirestoreFields(fields: Record<string, any>): Record<string, any> {
  const data: Record<string, any> = {};

  for (const [key, field] of Object.entries(fields)) {
    if (field.stringValue !== undefined) {
      data[key] = field.stringValue;
    } else if (field.integerValue !== undefined) {
      data[key] = parseInt(field.integerValue);
    } else if (field.booleanValue !== undefined) {
      data[key] = field.booleanValue;
    } else if (field.arrayValue) {
      data[key] = field.arrayValue.values?.map((v: any) => v.stringValue) || [];
    } else if (field.timestampValue) {
      data[key] = new Date(field.timestampValue);
    } else if (field.mapValue) {
      data[key] = convertFromFirestoreFields(field.mapValue.fields || {});
    }
  }

  return data;
}

// Firebase 인증 토큰 획득 (실제 Auth 토큰 사용)
async function getFirebaseToken(): Promise<string> {
  try {
    // Firebase Auth에서 실제 사용자 토큰 가져오기
    const { firebaseAuth } = await import("@/lib/firebase/client");
    const auth = firebaseAuth();

    if (auth?.currentUser) {
      const token = await auth.currentUser.getIdToken();
      console.log("[REST API] Successfully got Firebase Auth token");
      return token;
    } else {
      console.warn("[REST API] No authenticated user, using API key fallback");
      // 사용자가 인증되지 않은 경우 API 키로 폴백 (제한된 기능)
      return clientEnv.NEXT_PUBLIC_FIREBASE_API_KEY || '';
    }
  } catch (error: any) {
    console.error("[REST API] Failed to get Firebase Auth token:", error);
    // 에러 발생시 API 키로 폴백
    return clientEnv.NEXT_PUBLIC_FIREBASE_API_KEY || '';
  }
}

// 채팅방 생성 (REST API 버전)
export async function createChatRoomViaRest(
  userId: string,
  userName: string,
  adminId: string
): Promise<string> {
  const chatId = `${userId}_${adminId}`;

  const chatData = {
    participants: [userId, adminId],
    participantNames: {
      [userId]: userName,
      [adminId]: "관리자"
    },
    unreadCount: {
      [userId]: 0,
      [adminId]: 0
    },
    createdAt: new Date(),
    updatedAt: new Date()
  };

  try {
    await createDocumentViaRest('chats', chatId, chatData);
    console.log('[REST API] Chat room created successfully:', chatId);
    return chatId;
  } catch (error: any) {
    console.error('[REST API] Failed to create chat room:', error);
    throw new Error(`REST API로 채팅방 생성 실패: ${error.message}`);
  }
}

// 채팅방 ID로 직접 조회 (REST API 버전)
export async function getChatRoomByIdViaRest(chatId: string): Promise<any | null> {
  try {
    console.log('[REST API] Fetching chat room by ID:', chatId);

    const chatRoom = await getDocumentViaRest('chats', chatId);

    if (chatRoom) {
      console.log('[REST API] Chat room found:', chatId);
      return {
        id: chatId,
        ...chatRoom
      };
    } else {
      console.log('[REST API] Chat room not found:', chatId);
      return null;
    }
  } catch (error: any) {
    console.error('[REST API] Failed to fetch chat room:', error);
    return null;
  }
}

// Firestore REST API를 사용한 컬렉션 조회
export async function getCollectionViaRest(collection: string): Promise<any[]> {
  const url = `${FIRESTORE_REST_BASE}/${collection}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${await getFirebaseToken()}`
      }
    });

    if (!response.ok) {
      throw new Error(`Firebase REST API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    const documents = result.documents || [];

    return documents.map((doc: any) => {
      const id = doc.name.split('/').pop();
      return {
        id,
        ...convertFromFirestoreFields(doc.fields || {})
      };
    });
  } catch (error: any) {
    console.error('[REST API] Failed to get collection:', error);
    return [];
  }
}

// 관리자용 채팅방 목록 조회 (REST API 버전 - localStorage 우선, 빠른 방식)
export async function getAdminChatRoomsViaRest(adminId: string): Promise<any[]> {
  try {
    console.log('[REST API] Fetching admin chat rooms for:', adminId);

    // 우선 localStorage에서 빠르게 찾기
    const localStorageChatRooms = [];
    try {
      const recentChatIds = JSON.parse(localStorage.getItem('recentChatIds') || '[]');
      console.log('[REST API] Found recent chat IDs in localStorage:', recentChatIds);

      if (recentChatIds.length > 0) {
        console.log('[REST API] Loading chat rooms from localStorage (fast method)...');

        for (const chatId of recentChatIds) {
          try {
            const chatRoom = await getChatRoomByIdViaRest(chatId);
            if (chatRoom) {
              localStorageChatRooms.push(chatRoom);
              console.log('[REST API] ✅ Loaded chat room from localStorage:', chatId);
            } else {
              console.log('[REST API] ⚠️ Chat room not found in Firestore:', chatId);
            }
          } catch (error) {
            console.warn('[REST API] ❌ Failed to load chat room:', chatId, error);
          }
        }

        console.log('[REST API] 🎉 LocalStorage loading completed, found:', localStorageChatRooms.length, 'chat rooms');

        // localStorage에서 채팅방을 찾았다면 바로 반환 (빠른 결과)
        if (localStorageChatRooms.length > 0) {
          console.log('[REST API] ⚡ Returning localStorage results for fast loading');
          return localStorageChatRooms;
        }
      }
    } catch (error) {
      console.warn('[REST API] Failed to read from localStorage:', error);
    }

    // localStorage가 비어있거나 실패한 경우에만 Firestore 전체 조회 (느린 방법)
    console.log('[REST API] 🐌 No localStorage data found, falling back to slow Firestore scan...');
    console.log('[REST API] ⚠️ This may take 1-2 minutes for large databases');

    try {
      // 타임아웃 설정 (30초)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Firestore 조회 시간 초과 (30초)')), 30000)
      );

      const firestorePromise = getCollectionViaRest('chats');

      const allChatRooms = await Promise.race([firestorePromise, timeoutPromise]) as any[];
      console.log('[REST API] Found all chat rooms in Firestore:', allChatRooms.length);

      // 관리자가 참여한 채팅방만 필터링
      const adminChatRooms = allChatRooms.filter(chatRoom => {
        const participants = chatRoom.participants || [];
        const isAdminParticipant = participants.includes(adminId);
        if (isAdminParticipant) {
          console.log('[REST API] Found admin chat room in Firestore:', chatRoom.id);
        }
        return isAdminParticipant;
      });

      console.log('[REST API] Firestore scan completed, found:', adminChatRooms.length, 'admin chat rooms');
      return adminChatRooms;

    } catch (firestoreError: any) {
      console.error('[REST API] Firestore scan failed or timed out:', firestoreError);

      // Firestore 조회 실패시 빈 배열 반환 (에러 대신)
      console.log('[REST API] 🔄 Returning empty array due to Firestore failure');
      return [];
    }

  } catch (error: any) {
    console.error('[REST API] Failed to fetch admin chat rooms:', error);
    // 완전 실패시에도 빈 배열 반환 (사용자 경험 개선)
    return [];
  }
}