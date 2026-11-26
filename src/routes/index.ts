import { Router } from "express";
import { COMMON_MESSAGES } from "../constants/message.constant.js";
import { areaRouter, projectAreaRouter } from "../features/area/area.route.js";
import { authRouter } from "../features/auth/auth.route.js";
import { dashboardRouter } from "../features/dashboard/dashboard.route.js";
import { drawingRouter } from "../features/drawing/drawing.route.js";
import { commsRouter } from "../features/comms/comms.route.js";
import { pdfExportRouter } from "../features/pdf-export/pdf-export.route.js";
import { paymentRouter } from "../features/payment/payment.route.js";
import { projectDocumentRouter } from "../features/project-document/project-document.route.js";
import { reportRouter } from "../features/report/report.route.js";
import { uploadRouter } from "../features/upload/upload.route.js";
import { fileRouter } from "../features/upload/file.route.js";
import { projectRouter } from "../features/project/project.route.js";
import { userRouter } from "../features/user/user.route.js";
import { fieldApiRouter } from "./field-api.route.js";
import { officeApiRouter } from "./office-api.route.js";
import { ResponseHelper } from "../helpers/response.helper.js";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  ResponseHelper.ok(res, COMMON_MESSAGES.HEALTH_OK, { status: "ok" });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/files", fileRouter);
apiRouter.use("/office", officeApiRouter);
apiRouter.use("/field", fieldApiRouter);
apiRouter.use("/uploads", uploadRouter);
apiRouter.use("/payments", paymentRouter);
apiRouter.use("/projects/:projectId/drawings", drawingRouter);
apiRouter.use("/drawings", drawingRouter);
apiRouter.use("/projects/:projectId/documents", projectDocumentRouter);
apiRouter.use("/documents", projectDocumentRouter);
apiRouter.use("/projects/:projectId/comms", commsRouter);
apiRouter.use("/comms", commsRouter);
apiRouter.use("/reports", reportRouter);
apiRouter.use("/dashboard", dashboardRouter);
apiRouter.use("/exports", pdfExportRouter);
apiRouter.use("/users", userRouter);
apiRouter.use("/projects/:projectId/areas", projectAreaRouter);
apiRouter.use("/projects", projectRouter);
apiRouter.use("/areas", areaRouter);
