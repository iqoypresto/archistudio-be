import winston from "winston";
import { env } from "./env.config.js";

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

export const logger = winston.createLogger({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  silent: env.NODE_ENV === "test",
  format: logFormat,
  transports: [new winston.transports.Console()],
});
