import { Router } from "express";
import { COMMON_MESSAGES } from "../constants/message.constant.js";
import { authRouter } from "../features/auth/auth.route.js";
import { reportRouter } from "../features/report/report.route.js";
import { uploadRouter } from "../features/upload/upload.route.js";
import { ResponseHelper } from "../helpers/response.helper.js";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  ResponseHelper.ok(res, COMMON_MESSAGES.HEALTH_OK, { status: "ok" });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/uploads", uploadRouter);
apiRouter.use("/reports", reportRouter);
