import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_BASE_URL = process.env.GTW_BASE_URL ?? "http://127.0.0.1:31337";

function loadAuthSecret(): string | undefined {
  // Prefer explicit env var, fall back to reading the secret file
  if (process.env.GTW_AUTH_SECRET) {
    return process.env.GTW_AUTH_SECRET;
  }

  const home = process.env.GTW_HOME ?? process.cwd();
  const secretPath = resolve(home, "runtime", "state", "auth-secret.txt");
  if (existsSync(secretPath)) {
    const secret = readFileSync(secretPath, "utf8").trim();
    if (secret.length > 0) {
      return secret;
    }
  }

  return undefined;
}

function authHeaders(): Record<string, string> {
  const secret = loadAuthSecret();
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };
  if (secret) {
    headers["authorization"] = `Bearer ${secret}`;
  }
  return headers;
}

// Action calls may block while waiting for user approval (up to approvalTimeoutSeconds).
// Default HTTP timeout is set to 330s to allow the server-side 300s approval timeout to
// fire first with a proper error, while still preventing zombie connections.
const DEFAULT_TIMEOUT_MS = 330_000;

export async function callAutomationApi(
  pathname: string,
  body?: Record<string, unknown>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Record<string, unknown>> {
  const response = await fetch(`${DEFAULT_BASE_URL}${pathname}`, {
    method: "POST",
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs)
  }).catch((error) => {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error(
        `Request to ${pathname} timed out after ${Math.round(timeoutMs / 1000)}s. ` +
        "The action may still be waiting for user approval in the GO TO WORK control UI."
      );
    }
    throw error;
  });

  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok || payload.ok === false) {
    throw new Error(typeof payload.error === "string" ? payload.error : `API request failed for ${pathname}`);
  }

  return payload;
}

export async function fetchStatus(): Promise<Record<string, unknown>> {
  const response = await fetch(`${DEFAULT_BASE_URL}/api/status`);
  if (!response.ok) {
    throw new Error("GO TO WORK service is not running. Start `npm run serve` first.");
  }
  return (await response.json()) as Record<string, unknown>;
}
