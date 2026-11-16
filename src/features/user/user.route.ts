import { Router } from "express";
import { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import { UserController } from "./user.controller.js";

export const userRouter = Router();

userRouter.use(
  AuthMiddleware.authenticate,
  AuthMiddleware.authorizeRoles("OWNER", "ADMIN"),
);

userRouter.get("/", UserController.getUsers);
userRouter.post("/", UserController.createUser);
userRouter.patch("/:id", UserController.updateUser);
userRouter.patch("/:id/reset-password", UserController.resetPassword);
userRouter.patch("/:id/status", UserController.toggleStatus);
