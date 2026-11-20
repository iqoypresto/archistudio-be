import { Router } from "express";
import { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import { CommsController } from "./comms.controller.js";

/** Router Comms project khusus OWNER (/projects/:projectId/comms & /comms, BR-35). */
export const commsRouter = Router({ mergeParams: true });

commsRouter.use(AuthMiddleware.authenticate);
commsRouter.use(AuthMiddleware.authorizeRoles("OWNER"));

commsRouter.get("/", CommsController.listEntries);
commsRouter.post("/", CommsController.createEntry);
commsRouter.patch("/:id", CommsController.updateEntry);
