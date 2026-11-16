import { Router } from "express";
import { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import { ProjectController } from "./project.controller.js";

export const projectRouter = Router();

projectRouter.use(AuthMiddleware.authenticate);

projectRouter.get(
  "/",
  AuthMiddleware.authorizeRoles("OWNER", "ADMIN", "SUPERVISOR"),
  ProjectController.getProjects,
);

projectRouter.get(
  "/:id",
  AuthMiddleware.authorizeRoles("OWNER", "ADMIN", "SUPERVISOR"),
  ProjectController.getProjectById,
);

projectRouter.post(
  "/",
  AuthMiddleware.authorizeRoles("OWNER", "ADMIN"),
  ProjectController.createProject,
);

projectRouter.patch(
  "/:id",
  AuthMiddleware.authorizeRoles("OWNER", "ADMIN"),
  ProjectController.updateProject,
);

projectRouter.patch(
  "/:id/archive",
  AuthMiddleware.authorizeRoles("OWNER", "ADMIN"),
  ProjectController.archiveProject,
);
