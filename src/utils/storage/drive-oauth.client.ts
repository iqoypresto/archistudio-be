import { env } from "../../configs/env.config.js";
import { ResponseError } from "../errors/response-error.util.js";

interface OAuthTokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

function requireOAuthConfig(): { clientId: string; clientSecret: string; refreshToken: string } {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new ResponseError("STORAGE_UNAVAILABLE");
  }
  return { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, refreshToken: GOOGLE_REFRESH_TOKEN };
}

export async function getDriveAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const config = requireOAuthConfig();
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {
    throw new ResponseError("STORAGE_UNAVAILABLE");
  });
  if (!response.ok) throw new ResponseError("STORAGE_UNAVAILABLE");
  const payload = await response.json() as OAuthTokenResponse;
  if (typeof payload.access_token !== "string" || typeof payload.expires_in !== "number") {
    throw new ResponseError("STORAGE_UNAVAILABLE");
  }
  cachedToken = { value: payload.access_token, expiresAt: Date.now() + payload.expires_in * 1000 };
  return cachedToken.value;
}
