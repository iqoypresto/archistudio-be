import { getDriveAccessToken } from "./drive-oauth.client.js";
import { ResponseError } from "../errors/response-error.util.js";

const RETRY_LIMIT = 3;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function driveRequest(url: string, init: RequestInit = {}): Promise<Response> {
  let forceRefresh = false;
  for (let attempt = 0; attempt < RETRY_LIMIT; attempt += 1) {
    const token = await getDriveAccessToken(forceRefresh);
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(url, { ...init, headers, redirect: "manual", signal: AbortSignal.timeout(30_000) }).catch(async () => {
      if (attempt + 1 === RETRY_LIMIT) throw new ResponseError("STORAGE_UNAVAILABLE");
      await delay(250 * 2 ** attempt);
      return null;
    });
    if (!response) continue;
    if (response.status === 401 && !forceRefresh) {
      await response.body?.cancel();
      forceRefresh = true;
      attempt -= 1;
      continue;
    }
    if (!RETRYABLE_STATUS.has(response.status) || attempt + 1 === RETRY_LIMIT) return response;
    await response.body?.cancel();
    await delay(250 * 2 ** attempt);
  }
  throw new ResponseError("STORAGE_UNAVAILABLE");
}
