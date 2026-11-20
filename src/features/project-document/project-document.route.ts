import { Router } from "express";
import { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import { ProjectDocumentController } from "./project-document.controller.js";

/** Router dokumen keluar project khusus OWNER (/projects/:projectId/documents & /documents, BR-34). */
export const projectDocumentRouter = Router({ mergeParams: true });

projectDocumentRouter.use(AuthMiddleware.authenticate);
projectDocumentRouter.use(AuthMiddleware.authorizeRoles("OWNER"));

projectDocumentRouter.get("/", ProjectDocumentController.listDocuments);
projectDocumentRouter.post("/", ProjectDocumentController.createDocument);
projectDocumentRouter.delete("/:id", ProjectDocumentController.deleteDocument);
