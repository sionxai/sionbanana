import "server-only";

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { getDataDir } from "@/lib/local/storage";

const REFRESH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const REFRESH_ENDPOINT = "https://auth.openai.com/oauth/token";
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const ACCOUNT_ID_CLAIM = "https://api.openai.com/auth.chatgpt_account_id";

type CodexAuthFile = {
  tokens?: {
    access_token?: string;
    id_token?: string;
    refresh_token?: string;
    account_id?: string;
  };
  last_refresh?: string;
  OPENAI_API_KEY?: string;
};

type CachedAuth = {
  accessToken: string;
  accountId: string;
  refreshToken: string;
  expiresAt: number;
  filePath: string;
  source: CodexAuthSource;
  email?: string;
  planType?: string;
};

export type CodexAuthSource = "web" | "codex-cli";

export type CodexOAuthTokens = {
  access_token: string;
  id_token?: string;
  refresh_token: string;
  account_id?: string;
};

let cache: CachedAuth | null = null;
let inflight: Promise<CachedAuth> | null = null;

export class CodexAuthError extends Error {
  readonly code: "NOT_AUTHENTICATED" | "INVALID_TOKEN" | "REFRESH_FAILED" | "READ_FAILED";

  constructor(code: CodexAuthError["code"], message: string) {
    super(message);
    this.name = "CodexAuthError";
    this.code = code;
  }
}

type AuthFileCandidate = {
  filePath: string;
  source: CodexAuthSource;
};

export function getWebCodexAuthFilePath(): string {
  return path.join(getDataDir(), "codex-auth.json");
}

function authFileCandidates(): AuthFileCandidate[] {
  const candidates = [
    { filePath: getWebCodexAuthFilePath(), source: "web" },
    process.env.CHATGPT_LOCAL_HOME
      ? { filePath: path.join(process.env.CHATGPT_LOCAL_HOME, "auth.json"), source: "codex-cli" }
      : null,
    process.env.CODEX_HOME
      ? { filePath: path.join(process.env.CODEX_HOME, "auth.json"), source: "codex-cli" }
      : null,
    { filePath: path.join(homedir(), ".chatgpt-local", "auth.json"), source: "codex-cli" },
    { filePath: path.join(homedir(), ".codex", "auth.json"), source: "codex-cli" }
  ];
  return candidates.filter((candidate): candidate is AuthFileCandidate => Boolean(candidate));
}

async function locateAuthFile(): Promise<AuthFileCandidate> {
  for (const candidate of authFileCandidates()) {
    try {
      await fs.access(candidate.filePath);
      return candidate;
    } catch {
      // try next
    }
  }
  throw new CodexAuthError(
    "NOT_AUTHENTICATED",
    "Codex 인증 파일을 찾지 못했습니다. 터미널에서 `npx @openai/codex login`을 먼저 실행해주세요."
  );
}

async function readAuthFile(filePath: string): Promise<CodexAuthFile> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as CodexAuthFile;
  } catch (error) {
    throw new CodexAuthError(
      "READ_FAILED",
      `Codex 인증 파일을 읽을 수 없습니다 (${filePath}): ${(error as Error).message}`
    );
  }
}

async function writeAuthFile(filePath: string, data: CodexAuthFile): Promise<void> {
  const serialized = JSON.stringify(data, null, 2);
  const dir = path.dirname(filePath);
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.writeFile(tmpPath, serialized, { mode: 0o600 });
    await fs.rename(tmpPath, filePath);
    await fs.chmod(filePath, 0o600).catch(() => undefined);
  } catch (error) {
    await fs.unlink(tmpPath).catch(() => undefined);
    throw error;
  }
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split(".");
  if (parts.length < 2) {
    return null;
  }
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padding = padded.length % 4 === 0 ? 0 : 4 - (padded.length % 4);
    const base64 = padded + "=".repeat(padding);
    const json = Buffer.from(base64, "base64").toString("utf-8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function tokenExpiresAt(jwt: string): number {
  const payload = decodeJwtPayload(jwt);
  if (!payload || typeof payload.exp !== "number") {
    return 0;
  }
  return payload.exp * 1000;
}

function extractStringClaim(
  payload: Record<string, unknown> | null,
  keys: string[]
): string | undefined {
  if (!payload) {
    return undefined;
  }
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function extractAccountId(idToken: string | undefined, fallback: string | undefined): string | null {
  if (fallback && fallback.length > 0) {
    return fallback;
  }
  if (!idToken) {
    return null;
  }
  const payload = decodeJwtPayload(idToken);
  if (!payload) {
    return null;
  }
  const claim = payload[ACCOUNT_ID_CLAIM];
  if (typeof claim === "string" && claim.length > 0) {
    return claim;
  }
  if (typeof payload.chatgpt_account_id === "string" && payload.chatgpt_account_id.length > 0) {
    return payload.chatgpt_account_id;
  }
  return null;
}

async function refreshTokens(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  id_token?: string;
}> {
  const response = await fetch(REFRESH_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: REFRESH_CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: "openid profile email offline_access"
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new CodexAuthError(
      "REFRESH_FAILED",
      `Codex 토큰 리프레시 실패 (${response.status}): ${body.slice(0, 200)}`
    );
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
  };

  if (!data.access_token) {
    throw new CodexAuthError("REFRESH_FAILED", "리프레시 응답에 access_token이 없습니다.");
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refreshToken,
    id_token: data.id_token
  };
}

async function loadFreshAuth(): Promise<CachedAuth> {
  const located = await locateAuthFile();
  const filePath = located.filePath;
  const file = await readAuthFile(filePath);
  const tokens = file.tokens ?? {};

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new CodexAuthError(
      "INVALID_TOKEN",
      "auth.json에 access_token 또는 refresh_token이 없습니다. 다시 로그인해주세요."
    );
  }

  let accessToken = tokens.access_token;
  let refreshToken = tokens.refresh_token;
  let idToken = tokens.id_token;
  let expiresAt = tokenExpiresAt(accessToken);
  const needsRefresh = !expiresAt || expiresAt - Date.now() < REFRESH_MARGIN_MS;

  if (needsRefresh) {
    const refreshed = await refreshTokens(refreshToken);
    accessToken = refreshed.access_token;
    refreshToken = refreshed.refresh_token;
    idToken = refreshed.id_token ?? idToken;
    expiresAt = tokenExpiresAt(accessToken);

    const updatedFile: CodexAuthFile = {
      ...file,
      tokens: {
        ...tokens,
        access_token: accessToken,
        refresh_token: refreshToken,
        id_token: idToken
      },
      last_refresh: new Date().toISOString()
    };

    if (located.source === "web") {
      try {
        await writeAuthFile(filePath, updatedFile);
      } catch (error) {
        console.warn("[codex-oauth] web auth 재기록 실패 (메모리 캐시는 유지)", error);
      }
    }
  }

  const accountId = extractAccountId(idToken, tokens.account_id ?? undefined);
  if (!accountId) {
    throw new CodexAuthError(
      "INVALID_TOKEN",
      "id_token에서 chatgpt_account_id를 추출하지 못했습니다."
    );
  }

  const idPayload = idToken ? decodeJwtPayload(idToken) : null;

  return {
    accessToken,
    accountId,
    refreshToken,
    expiresAt: expiresAt || Date.now() + 60 * 60 * 1000,
    filePath,
    source: located.source,
    email: extractStringClaim(idPayload, ["email", "https://api.openai.com/auth.email"]),
    planType: extractStringClaim(idPayload, [
      "plan_type",
      "planType",
      "https://api.openai.com/auth.plan_type",
      "https://api.openai.com/auth.planType"
    ])
  };
}

export async function getCodexAuth(): Promise<{ accessToken: string; accountId: string }> {
  const fresh = await getFreshCachedAuth();
  return { accessToken: fresh.accessToken, accountId: fresh.accountId };
}

async function getFreshCachedAuth(): Promise<CachedAuth> {
  if (cache && cache.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return cache;
  }
  if (inflight) {
    return inflight;
  }

  inflight = loadFreshAuth();
  try {
    const fresh = await inflight;
    cache = fresh;
    return fresh;
  } finally {
    inflight = null;
  }
}

export function clearCodexAuthCache(): void {
  cache = null;
  inflight = null;
}

export async function saveWebCodexAuth(tokens: CodexOAuthTokens): Promise<string> {
  const filePath = getWebCodexAuthFilePath();
  const accountId = extractAccountId(tokens.id_token, tokens.account_id);
  const file: CodexAuthFile = {
    tokens: {
      access_token: tokens.access_token,
      id_token: tokens.id_token,
      refresh_token: tokens.refresh_token,
      ...(accountId ? { account_id: accountId } : {})
    },
    last_refresh: new Date().toISOString()
  };

  await writeAuthFile(filePath, file);
  clearCodexAuthCache();
  return filePath;
}

export async function deleteWebCodexAuth(): Promise<boolean> {
  const filePath = getWebCodexAuthFilePath();
  try {
    await fs.unlink(filePath);
    clearCodexAuthCache();
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      clearCodexAuthCache();
      return false;
    }
    throw error;
  }
}

export async function getCodexAuthStatus(): Promise<{
  authenticated: boolean;
  filePath?: string;
  accountId?: string;
  expiresAt?: number;
  source?: CodexAuthSource;
  email?: string;
  planType?: string;
  error?: { code: string; message: string };
}> {
  try {
    const fresh = await getFreshCachedAuth();
    return {
      authenticated: true,
      filePath: fresh.filePath,
      accountId: fresh.accountId,
      expiresAt: fresh.expiresAt,
      source: fresh.source,
      email: fresh.email,
      planType: fresh.planType
    };
  } catch (error) {
    if (error instanceof CodexAuthError) {
      return { authenticated: false, error: { code: error.code, message: error.message } };
    }
    return {
      authenticated: false,
      error: { code: "UNKNOWN", message: (error as Error).message }
    };
  }
}
