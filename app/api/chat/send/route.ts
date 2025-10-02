import { NextRequest, NextResponse } from "next/server";
import { ADMIN_UID } from "@/lib/constants";
import { getAdminAuth, getAdminRealtimeDb } from "@/lib/firebase/admin";

export async function POST(request: NextRequest) {
  try {
    const { chatId, content } = await request.json();

    if (!chatId || !content?.trim()) {
      return NextResponse.json(
        { error: "채팅방 ID와 메시지 내용이 필요합니다." },
        { status: 400 }
      );
    }

    // 인증 확인
    const auth = getAdminAuth();
    if (!auth) {
      return NextResponse.json(
        { error: "Firebase Auth가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "인증이 필요합니다." },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const decodedToken = await auth.verifyIdToken(token);

    const userId = decodedToken.uid;
    const userName = decodedToken.name || decodedToken.email || "사용자";

    const db = getAdminRealtimeDb();
    const chatRef = db.ref(`chats/${chatId}`);
    const chatSnapshot = await chatRef.get();
    const now = Date.now();

    let chatData = chatSnapshot.exists() ? chatSnapshot.val() as any : null;

    if (!chatData) {
      const participants: Record<string, string> = {
        [userId]: userName
      };
      if (userId !== ADMIN_UID) {
        participants[ADMIN_UID] = "관리자";
      }

      chatData = {
        participants,
        unreadCount: Object.keys(participants).reduce<Record<string, number>>((acc, id) => {
          acc[id] = 0;
          return acc;
        }, {}),
        createdAt: now,
        updatedAt: now,
        lastMessage: null,
        lastMessageAt: null
      };

      await chatRef.set(chatData);
    }

    const messagesRef = db.ref(`messages/${chatId}`);
    const newMessageRef = messagesRef.push();
    const messageId = newMessageRef.key ?? `msg_${now}`;

    await newMessageRef.set({
      id: messageId,
      chatId,
      senderId: userId,
      senderName: userName,
      content: content.trim(),
      timestamp: now,
      createdAt: now,
      readBy: {
        [userId]: now
      }
    });

    const participants = chatData.participants ? Object.keys(chatData.participants) : [];
    const unreadUpdates: Record<string, number> = { ...(chatData.unreadCount ?? {}) };
    participants
      .filter((participantId) => participantId !== userId)
      .forEach((participantId) => {
        unreadUpdates[participantId] = (unreadUpdates[participantId] ?? 0) + 1;
      });
    unreadUpdates[userId] = 0;

    await chatRef.update({
      lastMessage: content.trim(),
      lastMessageAt: now,
      updatedAt: now,
      unreadCount: unreadUpdates
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error sending message:", error);
    return NextResponse.json(
      { error: "메시지 전송에 실패했습니다." },
      { status: 500 }
    );
  }
}
