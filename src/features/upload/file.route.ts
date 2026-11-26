import { Router } from "express";
import { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import { FileController } from "./file.controller.js";

export const fileRouter = Router();
fileRouter.use(AuthMiddleware.authenticate);
fileRouter.get("/:storedFileId/content", FileController.getContent);
