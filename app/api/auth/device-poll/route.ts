import { NextResponse } from "next/server";
import { saveWebCodexAuth } from "@/lib/codex-oauth";

export const runtime = "nodejs";

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const TOKEN_ENDPOINT = "https://auth.openai.com/oauth/token";
const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

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

function pendingResponse(flow: PendingDeviceFlow, reason?: string) {
  return NextResponse.json({
    ok: true,
    status: "pending",
    nextIntervalMs: Math.max(1, flow.interval) * 1000,
    ...(reason ? { reason } : {})
  });
}

async function readJson(request: Request): Promise<{ session?: string }> {
  try {
    return (await request.json()) as { session?: string };
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const { session } = await readJson(request);
  if (!session || !/^sess_[0-9a-f-]+$/i.test(session)) {
    return NextResponse.json({
      ok: true,
      status: "error",
      nextIntervalMs: 5000,
      reason: "인증 세션이 올바르지 않습니다."
    });
  }

  const flows = getPendingDeviceFlows();
  const flow = flows.get(session);
  const now = Date.now();

  if (!flow || flow.expiresAt <= now) {
    flows.delete(session);
    return NextResponse.json({
      ok: true,
      status: "expired",
      nextIntervalMs: 5000,
      reason: "인증 코드가 만료되었습니다. 다시 시작해주세요."
    });
  }

  const minPollDelayMs = Math.max(1, flow.interval) * 1000;
  if (flow.lastPolledAt && now - flow.lastPolledAt < minPollDelayMs - 250) {
    return pendingResponse(flow);
  }

  flow.lastPolledAt = now;

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    device_code: flow.deviceCode,
    grant_type: DEVICE_GRANT_TYPE
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (response.ok) {
    const data = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      id_token?: string;
      account_id?: string;
    };

    if (!data.access_token || !data.refresh_token) {
      return NextResponse.json({
        ok: true,
        status: "error",
        nextIntervalMs: 5000,
        reason: "토큰 응답에 필요한 값이 없습니다."
      });
    }

    await saveWebCodexAuth({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      id_token: data.id_token,
      account_id: data.account_id
    });
    flows.delete(session);

    return NextResponse.json({
      ok: true,
      status: "success",
      nextIntervalMs: 0
    });
  }

  const errorBody = (await response.json().catch(() => null)) as {
    error?: string;
    error_description?: string;
  } | null;
  const error = errorBody?.error;

  if (response.status === 400 && error === "authorization_pending") {
    return pendingResponse(flow);
  }

  if (response.status === 400 && error === "slow_down") {
    flow.interval += 5;
    return pendingResponse(flow, "요청 간격을 늘려 다시 확인합니다.");
  }

  if (response.status === 400 && error === "expired_token") {
    flows.delete(session);
    return NextResponse.json({
      ok: true,
      status: "expired",
      nextIntervalMs: 5000,
      reason: "인증 코드가 만료되었습니다. 다시 시작해주세요."
    });
  }

  if (response.status === 400 && error === "access_denied") {
    flows.delete(session);
    return NextResponse.json({
      ok: true,
      status: "denied",
      nextIntervalMs: 5000,
      reason: "사용자가 인증 요청을 거부했습니다."
    });
  }

  return NextResponse.json({
    ok: true,
    status: "error",
    nextIntervalMs: 5000,
    reason: errorBody?.error_description ?? error ?? `토큰 확인 실패 (${response.status})`
  });
}
