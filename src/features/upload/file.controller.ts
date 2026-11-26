import type { Request, Response } from "express";
import { logger } from "../../configs/logger.config.js";
import type { AuthenticatedUser } from "../../types/express.js";
import { ResponseError } from "../../utils/errors/response-error.util.js";
import { validate } from "../../validations/validate.js";
import { FileService } from "./file.service.js";
import { UploadValidation } from "./upload.validation.js";

function authenticatedUser(req: Request): AuthenticatedUser {
  if (!req.user) throw new ResponseError("AUTHENTICATION_REQUIRED");
  return req.user;
}

export class FileController {
  static async getContent(req: Request, res: Response): Promise<void> {
    const { storedFileId } = validate(UploadValidation.BODY.contentParams, req.params);
    const content = await FileService.openContent(storedFileId, authenticatedUser(req));
    const encodedName = encodeURIComponent(content.fileName).replace(/[!'()*]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    res.status(200)
      .setHeader("Content-Type", content.mimeType)
      .setHeader("Content-Length", String(content.sizeBytes))
      .setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodedName}`)
      .setHeader("X-Content-Type-Options", "nosniff")
      .setHeader("Cache-Control", "private, no-store");
    content.stream.on("error", (error) => {
      logger.error("Drive content stream failed", { storedFileId, error });
      res.destroy(error);
    });
    content.stream.pipe(res);
  }
}
