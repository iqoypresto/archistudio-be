import { Prisma } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { ZodError } from "zod";
import { logger } from "../configs/logger.config.js";
import { ResponseError } from "../utils/errors/response-error.util.js";

/** Membentuk payload JSON error sesuai kontrak API Envelope. */
function sendErrorJson(
  res: Response,
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string[]>,
): void {
  res.status(status).json({
    success: false,
    error: { code, message, ...(fields ? { fields } : {}) },
  });
}

/** Menangani ZodError yang lolos langsung ke errorHandler. */
function handleZodError(err: ZodError, res: Response): void {
  const fields: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.map(String).join(".") || "root";
    const list = fields[key] ?? [];
    list.push(issue.message);
    fields[key] = list;
  }
  sendErrorJson(res, StatusCodes.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", "Data yang dikirim tidak valid.", fields);
}

/** Menangani error Prisma terkenal agar pesan tetap aman berbahasa Indonesia. */
function handlePrismaError(
  err: Prisma.PrismaClientKnownRequestError,
  res: Response,
): boolean {
  if (err.code === "P2002") {
    sendErrorJson(res, StatusCodes.CONFLICT, "CONFLICT", "Data sudah ada (duplikat).");
    return true;
  }
  if (err.code === "P2025") {
    sendErrorJson(res, StatusCodes.NOT_FOUND, "RESOURCE_NOT_FOUND", "Data tidak ditemukan.");
    return true;
  }
  return false;
}

/** Middleware penanganan error global paling akhir di Express app. */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const msg = err instanceof Error ? err.message : String(err);
  if (err instanceof ResponseError) {
    logger.warn(msg, { path: req.originalUrl, code: err.code });
    sendErrorJson(res, err.statusCode, err.code, err.message, err.fields);
    return;
  }
  logger.error(msg, { path: req.originalUrl, ...(err instanceof Error ? { stack: err.stack } : {}) });
  if (err instanceof ZodError) {
    handleZodError(err, res);
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && handlePrismaError(err, res)) {
    return;
  }
  sendErrorJson(res, StatusCodes.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Terjadi kesalahan pada server.");
}
