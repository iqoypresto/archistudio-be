import { Router } from "express";
import { COMMON_MESSAGES } from "../constants/message.constant.js";
import { authRouter } from "../features/auth/auth.route.js";
import { userRouter } from "../features/user/user.route.js";
import { ResponseHelper } from "../helpers/response.helper.js";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  ResponseHelper.ok(res, COMMON_MESSAGES.HEALTH_OK, { status: "ok" });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/users", userRouter);
