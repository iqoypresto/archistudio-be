import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://postgres:postgres@localhost:5432/archistudio_test"),
  DIRECT_URL: z
    .string()
    .min(1)
    .default("postgresql://postgres:postgres@localhost:5432/archistudio_test"),
  JWT_ACCESS_SECRET: z
    .string()
    .min(16)
    .default("test-access-secret-key-min-16-chars"),
  JWT_REFRESH_SECRET: z
    .string()
    .min(16)
    .default("test-refresh-secret-key-min-16-chars"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_DAYS: z.coerce.number().int().positive().default(30),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REFRESH_TOKEN: z.string().optional(),
  GOOGLE_DRIVE_FOLDER_ID: z.string().optional(),
  FILE_SESSION_ENCRYPTION_KEY: z.string().optional(),
  UPLOAD_CLEANUP_TOKEN: z.string().default(""),
});

export const env = envSchema.parse(process.env);
export type EnvConfig = typeof env;
