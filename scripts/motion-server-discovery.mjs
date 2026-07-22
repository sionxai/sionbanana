const MOTION_SERVER_PORTS = [3002, 3000, 3001, 3003, 3004, 3005];
const HEALTH_TIMEOUT_MS = 2500;

export async function findMotionServer(fetchImpl = fetch) {
  const failures = [];

  for (const port of MOTION_SERVER_PORTS) {
    const baseUrl = `http://localhost:${port}`;
    const url = `${baseUrl}/api/health`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

    try {
      const response = await fetchImpl(url, {
        method: "GET",
        signal: controller.signal
      });
      const text = await response.text();
      let body = {};
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          throw new Error(`Invalid JSON response from ${url}`);
        }
      }
      if (!response.ok) {
        const reason = typeof body?.reason === "string" ? body.reason : response.statusText;
        throw new Error(`${response.status} ${reason || "health request failed"}`);
      }
      if (body?.ok === true) {
        return { port, baseUrl };
      }
      failures.push(`${port}: health ok was not true`);
    } catch (error) {
      const reason = error?.name === "AbortError"
        ? `Request timed out after ${HEALTH_TIMEOUT_MS}ms`
        : error instanceof Error
          ? error.message
          : String(error);
      failures.push(`${port}: ${reason}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`No healthy sionbanana server. Tried ${failures.join("; ")}`);
}
