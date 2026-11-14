import { Router } from "express";
import { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import { AuthController } from "./auth.controller.js";

export const authRouter = Router();

authRouter.post("/login", AuthController.login);
authRouter.post("/refresh", AuthController.refresh);
authRouter.post("/logout", AuthMiddleware.authenticate, AuthController.logout);
authRouter.get("/me", AuthMiddleware.authenticate, AuthController.getMe);
