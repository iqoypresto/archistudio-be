import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./configs/env.config.js";
import { errorHandler } from "./middlewares/error-handler.middleware.js";
import { morganMiddleware } from "./middlewares/morgan.middleware.js";
import { apiRouter } from "./routes/index.js";
import { ResponseError } from "./utils/errors/response-error.util.js";

const corsOrigins = env.CORS_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const app = express();

app.use(helmet());
app.use(cors({ origin: corsOrigins, credentials: false }));
app.use(express.json({ limit: "1mb" }));
app.use(morganMiddleware);

app.use("/api/v1", apiRouter);

app.use((_req, _res, next) => {
  next(new ResponseError("RESOURCE_NOT_FOUND"));
});

app.use(errorHandler);

export default app;
