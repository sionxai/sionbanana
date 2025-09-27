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

// 관리자용 채팅방 목록 조회 (REST API 버전 - Firestore 직접 조회)
export async function getAdminChatRoomsViaRest(adminId: string): Promise<any[]> {
  try {
    console.log('[REST API] Fetching admin chat rooms for:', adminId);

    // 첫 번째 방법: localStorage에서 찾기 (빠른 방법)
    const localStorageChatRooms = [];
    try {
      const recentChatIds = JSON.parse(localStorage.getItem('recentChatIds') || '[]');
      console.log('[REST API] Found recent chat IDs in localStorage:', recentChatIds);

      for (const chatId of recentChatIds) {
        try {
          const chatRoom = await getChatRoomByIdViaRest(chatId);
          if (chatRoom) {
            localStorageChatRooms.push(chatRoom);
            console.log('[REST API] Successfully loaded chat room from localStorage:', chatId);
          }
        } catch (error) {
          console.warn('[REST API] Failed to load chat room from localStorage:', chatId, error);
        }
      }
    } catch (error) {
      console.warn('[REST API] Failed to read from localStorage:', error);
    }

    // 두 번째 방법: Firestore에서 관리자가 참여한 모든 채팅방 직접 조회
    console.log('[REST API] Fetching all chat rooms from Firestore...');
    const allChatRooms = await getCollectionViaRest('chats');
    console.log('[REST API] Found all chat rooms in Firestore:', allChatRooms.length);

    // 관리자가 참여한 채팅방만 필터링
    const adminChatRooms = allChatRooms.filter(chatRoom => {
      const participants = chatRoom.participants || [];
      const isAdminParticipant = participants.includes(adminId);
      if (isAdminParticipant) {
        console.log('[REST API] Found admin chat room:', chatRoom.id);
      }
      return isAdminParticipant;
    });

    // localStorage 결과와 Firestore 결과 합치기 (중복 제거)
    const allResults = [...localStorageChatRooms];
    for (const firestoreChatRoom of adminChatRooms) {
      const exists = allResults.find(room => room.id === firestoreChatRoom.id);
      if (!exists) {
        allResults.push(firestoreChatRoom);
        console.log('[REST API] Added chat room from Firestore:', firestoreChatRoom.id);
      }
    }

    console.log('[REST API] Admin chat rooms fetch completed, total found:', allResults.length);
    console.log('[REST API] Results breakdown:', {
      fromLocalStorage: localStorageChatRooms.length,
      fromFirestore: adminChatRooms.length,
      totalUnique: allResults.length
    });

    return allResults;

  } catch (error: any) {
    console.error('[REST API] Failed to fetch admin chat rooms:', error);
    throw new Error(`관리자 채팅방 목록 조회 실패: ${error.message}`);
  }
}