import crypto from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../../configs/env.config.js";
import { ResponseError } from "../errors/response-error.util.js";

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const s3Client = new S3Client({
  region: env.STORAGE_REGION,
  endpoint: env.STORAGE_ENDPOINT,
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
  const ext = CONTENT_TYPE_EXTENSIONS[params.contentType];
  if (!ext) {
    throw new ResponseError("UNSUPPORTED_FILE_TYPE");
  }
  const fileId = crypto.randomUUID();
  return `projects/${params.projectId}/areas/${params.areaId}/${params.reportDate}/${fileId}.${ext}`;
}

/** Menghasilkan presigned PUT URL agar browser HP mengunggah langsung ke R2/S3. */
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
