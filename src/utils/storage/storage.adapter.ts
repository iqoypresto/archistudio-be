import crypto from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../../configs/env.config.js";
import { ResponseError } from "../errors/response-error.util.js";

function normalizeStorageEndpoint(): string {
  if (env.STORAGE_PROVIDER !== "b2" || /^https?:\/\//i.test(env.STORAGE_ENDPOINT)) {
    return env.STORAGE_ENDPOINT;
  }
  return `https://${env.STORAGE_ENDPOINT}`;
}

function resolveStorageRegion(endpoint: string): string {
  if (env.STORAGE_PROVIDER !== "b2") return env.STORAGE_REGION;
  const region = new URL(endpoint).hostname.match(
    /(?:^|\.)s3\.([a-z0-9-]+)\.backblazeb2\.com$/i,
  )?.[1];
  if (!region) throw new Error("STORAGE_ENDPOINT harus berupa endpoint regional Backblaze B2.");
  return region;
}

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};
const REPORT_PHOTO_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const storageEndpoint = normalizeStorageEndpoint();

const s3Client = new S3Client({
  region: resolveStorageRegion(storageEndpoint),
  endpoint: storageEndpoint,
  forcePathStyle: env.STORAGE_PROVIDER === "minio",
  credentials: {
    accessKeyId: env.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
  },
});

export interface BuildPhotoKeyParams {
  projectId: string;
  areaId: string;
  reportDate: string;
  contentType: string;
}

/** Membangun storageKey terstruktur per project, area, dan tanggal bisnis. */
export function buildReportPhotoStorageKey(params: BuildPhotoKeyParams): string {
  if (!REPORT_PHOTO_CONTENT_TYPES.has(params.contentType)) {
    throw new ResponseError("UNSUPPORTED_FILE_TYPE");
  }
  const ext = CONTENT_TYPE_EXTENSIONS[params.contentType];
  if (!ext) {
    throw new ResponseError("UNSUPPORTED_FILE_TYPE");
  }
  const fileId = crypto.randomUUID();
  return `projects/${params.projectId}/areas/${params.areaId}/${params.reportDate}/${fileId}.${ext}`;
}

export type PurposeUpload = "payment-proof" | "drawing" | "project-document" | "comms-attachment";

/** Membuat key berkas non-laporan dari purpose yang sudah divalidasi backend. */
export function buildPurposeStorageKey(params: {
  purpose: PurposeUpload;
  referenceId: string;
  category?: string;
  contentType: string;
}): string {
  const ext = CONTENT_TYPE_EXTENSIONS[params.contentType];
  if (!ext) throw new ResponseError("UNSUPPORTED_FILE_TYPE");
  const fileId = crypto.randomUUID();
  const folder = resolvePurposeFolder(params.purpose, params.referenceId, params.category);
  return `${folder}/${fileId}.${ext}`;
}

function resolvePurposeFolder(purpose: PurposeUpload, referenceId: string, category?: string): string {
  if (purpose === "payment-proof") return `payments/${referenceId}/proofs`;
  if (purpose === "drawing") return `projects/${referenceId}/drawings/${category}`;
  if (purpose === "project-document") return `projects/${referenceId}/documents/${category}`;
  return `projects/${referenceId}/comms-attachments`;
}

/** Menghasilkan presigned PUT URL agar browser mengunggah langsung ke object storage. */
export async function createSignedUploadUrl(params: {
  storageKey: string;
  contentType: string;
  expiresInSeconds?: number;
}) {
  const expiresInSeconds = params.expiresInSeconds ?? env.STORAGE_UPLOAD_EXPIRES_SECONDS;
  const command = new PutObjectCommand({
    Bucket: env.STORAGE_BUCKET,
    Key: params.storageKey,
    ContentType: params.contentType,
  });
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
  return { uploadUrl, storageKey: params.storageKey, expiresInSeconds };
}

/** Menghasilkan presigned GET URL berumur pendek untuk bucket privat (ADR-02). */
export async function createSignedViewUrl(
  storageKey: string,
  expiresInSeconds = env.STORAGE_VIEW_EXPIRES_SECONDS,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.STORAGE_BUCKET,
    Key: storageKey,
  });
  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

/** Mengambil buffer biner objek langsung dari object storage (khusus kompilasi PDF). */
export async function getObjectBuffer(storageKey: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: env.STORAGE_BUCKET,
    Key: storageKey,
  });
  const response = await s3Client.send(command);
  if (!response.Body) {
    throw new Error(`Objek ${storageKey} tidak memiliki konten Body.`);
  }
  const bytes = await response.Body.transformToByteArray();
  return Buffer.from(bytes);
}

/** Memeriksa keberadaan objek foto dan mengambil timestamp unggah dari storage. */
export async function getObjectLastModified(storageKey: string): Promise<{ exists: boolean; lastModified: Date | null }> {
  try {
    const response = await s3Client.send(new HeadObjectCommand({
      Bucket: env.STORAGE_BUCKET,
      Key: storageKey,
    }));
    return { exists: true, lastModified: response.LastModified ?? null };
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return { exists: false, lastModified: null };
    throw error;
  }
}

/** Mengubah daftar storageKey menjadi peta { [storageKey]: signedViewUrl }. */
export async function createSignedViewUrlsMap(
  storageKeys: string[],
  expiresInSeconds = env.STORAGE_VIEW_EXPIRES_SECONDS,
): Promise<Record<string, string>> {
  const uniqueKeys = [...new Set(storageKeys)];
  const pairs = await Promise.all(
    uniqueKeys.map(async (key) => {
      const url = await createSignedViewUrl(key, expiresInSeconds);
      return [key, url] as const;
    }),
  );
  return Object.fromEntries(pairs);
}

/** Menghapus objek secara permanen dari object storage (khusus dokumen keluar BR-34). */
export async function deleteObject(storageKey: string): Promise<void> {
  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: env.STORAGE_BUCKET,
        Key: storageKey,
      }),
    );
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return;
    throw error;
  }
}

export const StorageAdapter = {
  buildReportPhotoStorageKey,
  buildPurposeStorageKey,
  createSignedUploadUrl,
  createSignedViewUrl,
  createSignedViewUrlsMap,
  getObjectLastModified,
  getObjectBuffer,
  deleteObject,
};
