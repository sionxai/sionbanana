import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const DEVICE_CODE_ENDPOINT = "https://auth.openai.com/oauth/device/code";
const DEVICE_SCOPE = "openid profile email offline_access";

type PendingDeviceFlow = {
  deviceCode: string;
  expiresAt: number;
  interval: number;
  createdAt: number;
  lastPolledAt?: number;
};

type DeviceFlowGlobal = typeof globalThis & {
  __sionbananaDeviceFlows?: Map<string, PendingDeviceFlow>;
};

function getPendingDeviceFlows() {
  const globalRef = globalThis as DeviceFlowGlobal;
  globalRef.__sionbananaDeviceFlows ??= new Map<string, PendingDeviceFlow>();
  return globalRef.__sionbananaDeviceFlows;
}

function cleanupExpiredFlows(now = Date.now()) {
  const flows = getPendingDeviceFlows();
  for (const [session, flow] of flows.entries()) {
    if (flow.expiresAt <= now) {
      flows.delete(session);
    }
  }
}

export async function POST() {
  cleanupExpiredFlows();

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    scope: DEVICE_SCOPE
  });

  const response = await fetch(DEVICE_CODE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return NextResponse.json(
      {
        ok: false,
        code: response.status >= 400 && response.status < 500 ? "DEVICE_AUTH_DISABLED" : "UPSTREAM_ERROR",
        reason:
          response.status >= 400 && response.status < 500
            ? "Codex용 장치 코드 인증이 비활성화돼 있을 수 있습니다. ChatGPT 보안 설정을 확인해주세요."
            : `장치 인증 코드를 발급하지 못했습니다. ${text.slice(0, 160)}`
      },
      { status: 200 }
    );
  }

  const data = (await response.json()) as {
    device_code?: string;
    user_code?: string;
    verification_uri?: string;
    verification_uri_complete?: string;
    expires_in?: number;
    interval?: number;
  };

  if (!data.device_code || !data.user_code || !data.verification_uri) {
    return NextResponse.json(
      { ok: false, code: "UPSTREAM_ERROR", reason: "장치 인증 응답 형식이 올바르지 않습니다." },
      { status: 200 }
    );
  }

  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 600;
  const interval = typeof data.interval === "number" ? data.interval : 5;
  const session = `sess_${randomUUID()}`;

  getPendingDeviceFlows().set(session, {
    deviceCode: data.device_code,
    expiresAt: Date.now() + expiresIn * 1000,
    interval,
    createdAt: Date.now()
  });

  return NextResponse.json({
    ok: true,
    session,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    verificationUriComplete:
      data.verification_uri_complete ??
      `${data.verification_uri}?user_code=${encodeURIComponent(data.user_code)}`,
    expiresIn,
    interval
  });
}
