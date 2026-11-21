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
  STORAGE_PROVIDER: z.enum(["b2", "r2", "s3", "minio"]).default("r2"),
  STORAGE_ENDPOINT: z.string().default("https://example.r2.cloudflarestorage.com"),
  STORAGE_REGION: z.string().default("auto"),
  STORAGE_BUCKET: z.string().default("archistudio-reports"),
  STORAGE_ACCESS_KEY_ID: z.string().default("test-access-key"),
  STORAGE_SECRET_ACCESS_KEY: z.string().default("test-secret-key"),
  STORAGE_UPLOAD_EXPIRES_SECONDS: z.coerce.number().int().positive().default(300),
  STORAGE_VIEW_EXPIRES_SECONDS: z.coerce.number().int().positive().default(900),
});

export const env = envSchema.parse(process.env);
export type EnvConfig = typeof env;
