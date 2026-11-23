import { Role } from "@prisma/client";
import { Router } from "express";
import { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import { ReportController } from "./report.controller.js";
import { authorizeUploadCleanup } from "../../middlewares/upload-cleanup.middleware.js";

export const reportRouter = Router();

reportRouter.post("/upload-sessions/cleanup", authorizeUploadCleanup, ReportController.cleanupUploadSessions);
reportRouter.use(AuthMiddleware.authenticate);

reportRouter.post("/upload-sessions", AuthMiddleware.authorizeRoles(Role.SUPERVISOR), ReportController.createUploadSession);

reportRouter.get(
  "/archive",
  AuthMiddleware.authorizeRoles(Role.OWNER, Role.ADMIN),
  ReportController.listArchive,
);

reportRouter.get(
  "/my-areas-status",
  AuthMiddleware.authorizeRoles(Role.SUPERVISOR),
  ReportController.getMyAreasStatus,
);

reportRouter.get(
  "/",
  AuthMiddleware.authorizeRoles(Role.OWNER, Role.ADMIN, Role.SUPERVISOR),
  ReportController.listReports,
);

reportRouter.get(
  "/:id",
  AuthMiddleware.authorizeRoles(Role.OWNER, Role.ADMIN, Role.SUPERVISOR),
  ReportController.getReportById,
);

reportRouter.post(
  "/submit",
  AuthMiddleware.authorizeRoles(Role.SUPERVISOR),
  ReportController.submitNew,
);

reportRouter.patch(
  "/:id/revise",
  AuthMiddleware.authorizeRoles(Role.OWNER, Role.ADMIN, Role.SUPERVISOR),
  ReportController.reviseReport,
);

reportRouter.post(
  "/areas/:areaId/unlock",
  AuthMiddleware.authorizeRoles(Role.OWNER, Role.ADMIN),
  ReportController.unlockArea,
);
