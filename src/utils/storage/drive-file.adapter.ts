import { Readable } from "node:stream";
import type { StoredFile } from "@prisma/client";
import { ResponseError } from "../errors/response-error.util.js";
import { driveRequest } from "./drive-api.client.js";
import type { DriveFileMetadata } from "./drive-upload.adapter.js";

const FILE_FIELDS = "id,name,mimeType,size,parents";

export async function getDriveFileMetadata(fileId: string): Promise<DriveFileMetadata> {
  const response = await driveRequest(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${FILE_FIELDS}&supportsAllDrives=true`,
  );
  if (!response.ok) throw new ResponseError("STORAGE_UNAVAILABLE");
  return await response.json() as DriveFileMetadata;
}

export function assertDriveFileMatchesStoredFile(
  metadata: DriveFileMetadata,
  file: Pick<StoredFile, "driveFolderId" | "fileName" | "mimeType" | "sizeBytes">,
): asserts metadata is DriveFileMetadata & { id: string } {
  const valid = metadata.id && metadata.name === file.fileName && metadata.mimeType === file.mimeType &&
    Number(metadata.size) === file.sizeBytes && metadata.parents?.includes(file.driveFolderId);
  if (!valid) throw new ResponseError("INVALID_FILE_REFERENCE");
}

export async function streamDriveFile(fileId: string): Promise<{ body: Readable; mimeType: string | null }> {
  const response = await driveRequest(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
  );
  if (!response.ok || !response.body) throw new ResponseError("STORAGE_UNAVAILABLE");
  const stream = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream<Uint8Array>);
  return { body: stream, mimeType: response.headers.get("content-type") };
}

export async function downloadDriveFileBuffer(fileId: string, maxBytes: number): Promise<Buffer> {
  const response = await driveRequest(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
  );
  if (!response.ok) throw new ResponseError("STORAGE_UNAVAILABLE");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) throw new ResponseError("FILE_TOO_LARGE");
  return buffer;
}

export async function deleteDriveFile(fileId: string): Promise<void> {
  const response = await driveRequest(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
    { method: "DELETE" },
  );
  if (!response.ok && response.status !== 404) throw new ResponseError("STORAGE_UNAVAILABLE");
}
