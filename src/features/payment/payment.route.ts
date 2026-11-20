import { Router } from "express";
import { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import { PaymentController } from "./payment.controller.js";

/** Router pembayaran global Freelance/Agent khusus OWNER (/api/v1/payments, BR-36). */
export const paymentRouter = Router();

paymentRouter.use(AuthMiddleware.authenticate);
paymentRouter.use(AuthMiddleware.authorizeRoles("OWNER"));

paymentRouter.get("/people", PaymentController.getPeople);
paymentRouter.post("/people", PaymentController.createPerson);
paymentRouter.get("/people/:personId/records", PaymentController.getRecordsByPerson);
paymentRouter.post("/people/:personId/records", PaymentController.createRecord);
paymentRouter.patch("/records/:id", PaymentController.updateRecord);
