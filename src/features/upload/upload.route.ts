import { Role } from "@prisma/client";
import express, { Router } from "express";
import { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import { UploadController } from "./upload.controller.js";

export const uploadRouter = Router();
uploadRouter.use(AuthMiddleware.authenticate);
uploadRouter.use(AuthMiddleware.authorizeRoles(Role.OWNER, Role.ADMIN, Role.SITE_MANAGER, Role.SUPERVISOR));

uploadRouter.post("/sessions", UploadController.createSession);
uploadRouter.get("/sessions/:uploadSessionId", UploadController.getStatus);
uploadRouter.put(
  "/sessions/:uploadSessionId/chunks",
  express.raw({ type: "application/octet-stream", limit: "4mb" }),
  UploadController.uploadChunk,
);
uploadRouter.post("/sessions/:uploadSessionId/complete", UploadController.complete);
uploadRouter.delete("/sessions/:uploadSessionId", UploadController.cancel);
