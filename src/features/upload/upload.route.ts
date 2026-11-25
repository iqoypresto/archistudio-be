import { Role } from "@prisma/client";
import { Router } from "express";
import { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import { UploadController } from "./upload.controller.js";

export const uploadRouter = Router();

uploadRouter.use(AuthMiddleware.authenticate);

uploadRouter.post(
  "/sign",
  AuthMiddleware.authorizeRoles(Role.OWNER, Role.ADMIN, Role.SITE_MANAGER, Role.SUPERVISOR),
  UploadController.signUploadUrls,
);

uploadRouter.post(
  "/view-urls",
  AuthMiddleware.authorizeRoles(Role.OWNER, Role.ADMIN, Role.SITE_MANAGER, Role.SUPERVISOR),
  UploadController.getReportViewUrls,
);
