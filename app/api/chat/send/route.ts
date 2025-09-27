import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { sendMessage } from "@/lib/firebase/chat";

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

    // 메시지 전송
    await sendMessage(chatId, userId, userName, content.trim());

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error sending message:", error);
    return NextResponse.json(
      { error: "메시지 전송에 실패했습니다." },
      { status: 500 }
    );
  }
}