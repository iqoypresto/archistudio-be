import morgan from "morgan";
import { env } from "../configs/env.config.js";
import { logger } from "../configs/logger.config.js";

const stream = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};

export const morganMiddleware = morgan(
  env.NODE_ENV === "production" ? "combined" : "dev",
  {
    stream,
    skip: () => env.NODE_ENV === "test",
  },
);
