import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { env } from "../configs/env.config.js";
import { ResponseError } from "../utils/errors/response-error.util.js";
import { cleanupUploadSessionTokenSchema } from "../features/report/report-upload-session.validation.js";

export function authorizeUploadCleanup(req: Request, _res: Response, next: NextFunction): void {
  const parsed = cleanupUploadSessionTokenSchema.safeParse(env.UPLOAD_CLEANUP_TOKEN);
  if (!parsed.success) throw new ResponseError("FORBIDDEN");
  const expected = parsed.data;
  const received = req.header("x-upload-cleanup-token") ?? "";
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (!expected || expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)) {
    throw new ResponseError("FORBIDDEN");
  }
  next();
}
