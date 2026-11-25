import { Role } from "@prisma/client";
import { Router } from "express";
import { projectAreaRouter } from "../features/area/area.route.js";
import { drawingRouter } from "../features/drawing/drawing.route.js";
import { commsRouter } from "../features/comms/comms.route.js";
import { reportRouter } from "../features/report/report.route.js";
import { uploadRouter } from "../features/upload/upload.route.js";
import { projectRouter } from "../features/project/project.route.js";
import { AuthMiddleware } from "../middlewares/auth.middleware.js";

export const fieldApiRouter = Router();
fieldApiRouter.use(AuthMiddleware.authenticate);
fieldApiRouter.use(AuthMiddleware.authorizeRoles(Role.SUPERVISOR, Role.SITE_MANAGER));

fieldApiRouter.use("/projects/:projectId/drawings", drawingRouter);
fieldApiRouter.use("/projects/:projectId/comms", commsRouter);
fieldApiRouter.use("/comms", commsRouter);
fieldApiRouter.use("/projects/:projectId/areas", projectAreaRouter);
fieldApiRouter.use("/projects", projectRouter);
fieldApiRouter.use("/reports", reportRouter);
fieldApiRouter.use("/uploads", uploadRouter);
