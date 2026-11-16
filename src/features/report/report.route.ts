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
