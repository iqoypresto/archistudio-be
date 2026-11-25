import { Router } from "express";
import { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import { DrawingController } from "./drawing.controller.js";

/** Router Drawing project (/projects/:projectId/drawings & /drawings, BR-32, BR-33). */
export const drawingRouter = Router({ mergeParams: true });

drawingRouter.use(AuthMiddleware.authenticate);

drawingRouter.get(
  "/",
  AuthMiddleware.authorizeRoles("OWNER", "ADMIN", "SITE_MANAGER", "SUPERVISOR"),
  DrawingController.listDrawings,
);

drawingRouter.post(
  "/",
  AuthMiddleware.authorizeRoles("OWNER"),
  DrawingController.createDrawing,
);

drawingRouter.post(
  "/:id/archive",
  AuthMiddleware.authorizeRoles("OWNER"),
  DrawingController.archiveDrawing,
);
