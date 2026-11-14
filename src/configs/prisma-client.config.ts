import { PrismaClient } from "@prisma/client";
import { env } from "./env.config.js";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

/** Singleton PrismaClient v6 membaca DATABASE_URL & DIRECT_URL langsung dari schema.prisma. */
export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
