import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../../configs/env.config.js";
import { ResponseError } from "../errors/response-error.util.js";

const ALGORITHM = "aes-256-gcm";

function encryptionKey(): Buffer {
  const value = env.FILE_SESSION_ENCRYPTION_KEY ?? "";
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new ResponseError("STORAGE_UNAVAILABLE");
  return Buffer.from(value, "hex");
}

export function encryptDriveSessionUri(uri: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(uri, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptDriveSessionUri(value: string): string {
  const [ivText, tagText, cipherText] = value.split(".");
  if (!ivText || !tagText || !cipherText) throw new ResponseError("STORAGE_UNAVAILABLE");
  try {
    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(cipherText, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new ResponseError("STORAGE_UNAVAILABLE");
  }
}
