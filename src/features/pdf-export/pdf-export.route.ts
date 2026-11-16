import { Role } from "@prisma/client";
import { Router } from "express";
import { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import { PdfExportController } from "./pdf-export.controller.js";

export const pdfExportRouter = Router();

pdfExportRouter.use(AuthMiddleware.authenticate);
pdfExportRouter.use(AuthMiddleware.authorizeRoles(Role.OWNER, Role.ADMIN));

pdfExportRouter.get("/daily-report-pdf", PdfExportController.exportDailyReportPdf);
