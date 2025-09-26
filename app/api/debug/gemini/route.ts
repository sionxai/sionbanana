import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";

export async function GET() {
  return NextResponse.json({
    hasGeminiKey: !!serverEnv.GEMINI_API_KEY,
    keyPrefix: serverEnv.GEMINI_API_KEY ? `${serverEnv.GEMINI_API_KEY.substring(0, 15)}...` : 'none',
    keyLength: serverEnv.GEMINI_API_KEY?.length || 0
  });
}