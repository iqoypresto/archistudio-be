import { Role } from "@prisma/client";
import { Router } from "express";
import { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import { DashboardController } from "./dashboard.controller.js";

export const dashboardRouter = Router();

dashboardRouter.use(AuthMiddleware.authenticate);
dashboardRouter.use(AuthMiddleware.authorizeRoles(Role.OWNER, Role.ADMIN));

dashboardRouter.get("/summary", DashboardController.getSummary);
dashboardRouter.get("/supervisor-lateness", DashboardController.getSupervisorLateness);
