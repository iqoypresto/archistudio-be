import { env } from "../../configs/env.config.js";
import { ResponseError } from "../errors/response-error.util.js";
import { driveRequest } from "./drive-api.client.js";

export interface DriveFileMetadata {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string;
  parents?: string[];
}

export async function createDriveApplicationFolder(name = "ArchiStudio Private Files"): Promise<string> {
  const response = await driveRequest(
    "https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType&supportsAllDrives=true",
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder" }),
    },
  );
  if (!response.ok) throw new ResponseError("STORAGE_UNAVAILABLE");
  const folder = await response.json() as DriveFileMetadata;
  if (!folder.id || folder.mimeType !== "application/vnd.google-apps.folder") {
    throw new ResponseError("STORAGE_UNAVAILABLE");
  }
  return folder.id;
}

export type DriveChunkResult =
  | { complete: false; nextOffsetBytes: number }
  | { complete: true; file: DriveFileMetadata };

function requireFolderId(): string {
  if (!env.GOOGLE_DRIVE_FOLDER_ID) throw new ResponseError("STORAGE_UNAVAILABLE");
  return env.GOOGLE_DRIVE_FOLDER_ID;
}

function parseNextOffset(range: string | null): number {
  const match = range?.match(/bytes=0-(\d+)/);
  return match?.[1] ? Number(match[1]) + 1 : 0;
}

function isSessionUriAllowed(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "www.googleapis.com" && !url.username && !url.password &&
      !url.port && url.pathname === "/upload/drive/v3/files";
  } catch {
    return false;
  }
}

export async function createDriveUploadSession(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<string> {
  const url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true";
  const response = await driveRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": input.mimeType,
      "X-Upload-Content-Length": String(input.sizeBytes),
    },
    body: JSON.stringify({ name: input.fileName, mimeType: input.mimeType, parents: [requireFolderId()] }),
  });
  const uri = response.headers.get("location");
  if (!response.ok || !uri || !isSessionUriAllowed(uri)) throw new ResponseError("STORAGE_UNAVAILABLE");
  return uri;
}

export async function sendDriveChunk(input: {
  sessionUri: string;
  bytes: Buffer;
  start: number;
  end: number;
  total: number;
}): Promise<DriveChunkResult> {
  if (!isSessionUriAllowed(input.sessionUri)) throw new ResponseError("STORAGE_UNAVAILABLE");
  const body = new Uint8Array(input.bytes.byteLength);
  body.set(input.bytes);
  const response = await driveRequest(input.sessionUri, {
    method: "PUT",
    headers: { "Content-Length": String(input.bytes.byteLength), "Content-Range": `bytes ${input.start}-${input.end}/${input.total}` },
    body,
  });
  if (response.status === 308) return { complete: false, nextOffsetBytes: parseNextOffset(response.headers.get("range")) };
  if (response.status === 200 || response.status === 201) {
    return { complete: true, file: await response.json() as DriveFileMetadata };
  }
  if (response.status === 404 || response.status === 410) throw new ResponseError("UPLOAD_SESSION_EXPIRED");
  throw new ResponseError("STORAGE_UNAVAILABLE");
}

export async function getDriveUploadOffset(sessionUri: string, totalBytes: number): Promise<DriveChunkResult> {
  if (!isSessionUriAllowed(sessionUri)) throw new ResponseError("STORAGE_UNAVAILABLE");
  const response = await driveRequest(sessionUri, {
    method: "PUT",
    headers: { "Content-Length": "0", "Content-Range": `bytes */${totalBytes}` },
  });
  if (response.status === 308) return { complete: false, nextOffsetBytes: parseNextOffset(response.headers.get("range")) };
  if (response.status === 200 || response.status === 201) {
    return { complete: true, file: await response.json() as DriveFileMetadata };
  }
  if (response.status === 404 || response.status === 410) throw new ResponseError("UPLOAD_SESSION_EXPIRED");
  throw new ResponseError("STORAGE_UNAVAILABLE");
}

export async function cancelDriveUploadSession(sessionUri: string): Promise<void> {
  if (!isSessionUriAllowed(sessionUri)) return;
  const response = await driveRequest(sessionUri, { method: "DELETE" });
  if (!response.ok && response.status !== 404 && response.status !== 410) throw new ResponseError("STORAGE_UNAVAILABLE");
}
