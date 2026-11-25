import { Router } from "express";
import { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import { AreaController } from "./area.controller.js";

/** Router untuk sub-rute project: /api/v1/projects/:projectId/areas */
export const projectAreaRouter = Router({ mergeParams: true });
projectAreaRouter.use(AuthMiddleware.authenticate);

projectAreaRouter.get(
  "/",
  AuthMiddleware.authorizeRoles("OWNER", "ADMIN", "SITE_MANAGER", "SUPERVISOR"),
  AreaController.getAreasByProject,
);

projectAreaRouter.post(
  "/",
  AuthMiddleware.authorizeRoles("OWNER", "ADMIN"),
  AreaController.createArea,
);

/** Router untuk rute entitas area: /api/v1/areas */
export const areaRouter = Router();
areaRouter.use(AuthMiddleware.authenticate);

areaRouter.patch(
  "/:areaId",
  AuthMiddleware.authorizeRoles("OWNER", "ADMIN"),
  AreaController.updateArea,
);

areaRouter.post(
  "/:areaId/assignments",
  AuthMiddleware.authorizeRoles("OWNER", "ADMIN"),
  AreaController.assignSupervisor,
);

areaRouter.get(
  "/:areaId/assignments",
  AuthMiddleware.authorizeRoles("OWNER", "ADMIN"),
  AreaController.getAssignmentHistory,
);
