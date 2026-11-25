import { Router } from "express";
import { COMMS_ALLOWED_ROLES } from "../../helpers/access-policy.helper.js";
import { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import { CommsController } from "./comms.controller.js";

/** Router Comms In & Out project (/projects/:projectId/comms & /comms, BR-35, K-02). */
export const commsRouter = Router({ mergeParams: true });

commsRouter.use(AuthMiddleware.authenticate);
commsRouter.use(AuthMiddleware.authorizeRoles(...COMMS_ALLOWED_ROLES));

commsRouter.get("/", CommsController.listEntries);
commsRouter.post("/", CommsController.createEntry);
commsRouter.patch("/:id", CommsController.updateEntry);
