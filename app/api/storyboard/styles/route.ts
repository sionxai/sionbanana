import { NextResponse } from "next/server";
import { getActiveStoryboardStylesAdmin } from "@/lib/storyboard/firestore-admin";
import { FALLBACK_STORYBOARD_STYLES } from "@/data/storyboard-styles";

export async function GET() {
  try {
    const styles = await getActiveStoryboardStylesAdmin().catch(() => []);
    if (styles.length === 0) {
      return NextResponse.json({ styles: FALLBACK_STORYBOARD_STYLES });
    }
    return NextResponse.json({ styles });
  } catch (error) {
    console.error("[/api/storyboard/styles] failed", error);
    return NextResponse.json({ styles: FALLBACK_STORYBOARD_STYLES }, { status: 200 });
  }
}

