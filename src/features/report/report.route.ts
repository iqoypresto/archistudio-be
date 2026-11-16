import { Role } from "@prisma/client";
import { Router } from "express";
import { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import { ReportController } from "./report.controller.js";

export const reportRouter = Router();

reportRouter.use(AuthMiddleware.authenticate);

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
  "/draft",
  AuthMiddleware.authorizeRoles(Role.SUPERVISOR),
  ReportController.saveDraft,
);

reportRouter.put(
  "/:id/draft",
  AuthMiddleware.authorizeRoles(Role.SUPERVISOR),
  ReportController.updateDraft,
);

reportRouter.post(
  "/:id/submit",
  AuthMiddleware.authorizeRoles(Role.SUPERVISOR),
  ReportController.submitReport,
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
