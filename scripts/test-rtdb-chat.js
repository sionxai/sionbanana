// Realtime Database 채팅 테스트 스크립트
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, set, serverTimestamp } = require('firebase/database');

// Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyCO8jsRaN0KAk4hZ1qVO4YLzChtf3A4zek",
  authDomain: "sionbanana.firebaseapp.com",
  projectId: "sionbanana",
  databaseURL: "https://sionbanana-default-rtdb.asia-southeast1.firebasedatabase.app/",
  storageBucket: "sionbanana.firebasestorage.app",
  messagingSenderId: "309643440962",
  appId: "1:309643440962:web:285958c6382c94761a0edb",
  measurementId: "G-7PJLWZR0EH"
};

const ADMIN_UID = "ACHNkfU8GNT5u8AtGNP0UsszqIR2";

async function createTestChatRoom() {
  try {
    console.log('[Test] Initializing Firebase...');
    const app = initializeApp(firebaseConfig);
    const database = getDatabase(app, firebaseConfig.databaseURL);

    console.log('[Test] Database initialized successfully');

    // 테스트 사용자 ID 생성
    const testUserId = `test_user_${Date.now()}`;
    const chatId = `${testUserId}_${ADMIN_UID}`;

    console.log(`[Test] Creating test chat room: ${chatId}`);

    const chatData = {
      participants: {
        [testUserId]: "테스트 사용자",
        [ADMIN_UID]: "관리자"
      },
      unreadCount: {
        [testUserId]: 0,
        [ADMIN_UID]: 1
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastMessage: "안녕하세요, 테스트 메시지입니다!",
      lastMessageAt: Date.now()
    };

    const chatRef = ref(database, `chats/${chatId}`);
    await set(chatRef, chatData);

    console.log(`[Test] ✅ Successfully created test chat room: ${chatId}`);
    console.log('[Test] Chat data:', JSON.stringify(chatData, null, 2));

    // 데이터베이스 URL 출력
    console.log(`[Test] 🔗 View in Firebase Console: https://console.firebase.google.com/project/sionbanana/database/sionbanana-default-rtdb/data`);
    console.log(`[Test] 🔗 Direct API URL: https://sionbanana-default-rtdb.asia-southeast1.firebasedatabase.app/chats/${chatId}.json`);

  } catch (error) {
    console.error('[Test] Error creating test chat room:', error);
  }
}

createTestChatRoom();