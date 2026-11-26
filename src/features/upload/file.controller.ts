import type { Request, Response } from "express";
import { logger } from "../../configs/logger.config.js";
import type { AuthenticatedUser } from "../../types/express.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { validate } from "../../validations/validate.js";
import { FileService } from "./file.service.js";
import { UploadValidation } from "./upload.validation.js";

const CONTENT_CACHE_CONTROL = "private, max-age=3600";

function authenticatedUser(req: Request): AuthenticatedUser {
  if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
  return req.user;
}

function encodeContentFileName(fileName: string): string {
  return encodeURIComponent(fileName).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export class FileController {
  static async getContent(req: Request, res: Response): Promise<void> {
    const { storedFileId } = validate(UploadValidation.BODY.contentParams, req.params);
    const { variant } = validate(UploadValidation.BODY.contentQuery, req.query);
    const ifNoneMatch =
      typeof req.headers["if-none-match"] === "string" ? req.headers["if-none-match"] : undefined;
    const content = await FileService.openContent(storedFileId, authenticatedUser(req), {
      variant,
      ifNoneMatch,
    });
    res
      .setHeader("ETag", content.etag)
      .setHeader("Vary", "Authorization")
      .setHeader("Cache-Control", CONTENT_CACHE_CONTROL);
    if (content.notModified) {
      res.status(304).end();
      return;
    }
    res
      .status(200)
      .setHeader("Content-Type", content.mimeType)
      .setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeContentFileName(content.fileName)}`)
      .setHeader("X-Content-Type-Options", "nosniff");
    if (content.sizeBytes !== null) {
      res.setHeader("Content-Length", String(content.sizeBytes));
    }
    content.stream.on("error", (error) => {
      logger.error("Drive content stream failed", { storedFileId, error });
      res.destroy(error);
    });
    content.stream.pipe(res);
  }
}
