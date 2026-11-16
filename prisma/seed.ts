import "dotenv/config";
import { ProjectStatus, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../src/configs/prisma-client.config.js";

interface SeedUserConfig {
  name: string;
  username: string;
  phone: string;
  password: string;
  role: Role;
  jobTitle: string;
}

function getUserSeedConfigs(): SeedUserConfig[] {
  const defPass = process.env.SEED_DEFAULT_PASSWORD || "ArchiStudio2026!";
  return [
    {
      name: process.env.SEED_OWNER_NAME || "Budi Santoso (Owner)",
      username: process.env.SEED_OWNER_USERNAME || "owner",
      phone: process.env.SEED_OWNER_PHONE || "081100000001",
      password: process.env.SEED_OWNER_PASSWORD || defPass,
      role: Role.OWNER,
      jobTitle: process.env.SEED_OWNER_JOB_TITLE || "Owner / Direktur",
    },
    {
      name: process.env.SEED_ADMIN_NAME || "Siti Rahma (Admin)",
      username: process.env.SEED_ADMIN_USERNAME || "admin",
      phone: process.env.SEED_ADMIN_PHONE || "081100000002",
      password: process.env.SEED_ADMIN_PASSWORD || defPass,
      role: Role.ADMIN,
      jobTitle: process.env.SEED_ADMIN_JOB_TITLE || "Admin Proyek",
    },
    {
      name: process.env.SEED_SUPERVISOR1_NAME || "Ahmad Fauzi",
      username: process.env.SEED_SUPERVISOR1_USERNAME || "supervisor1",
      phone: process.env.SEED_SUPERVISOR1_PHONE || "081100000003",
      password: process.env.SEED_SUPERVISOR1_PASSWORD || defPass,
      role: Role.SUPERVISOR,
      jobTitle: process.env.SEED_SUPERVISOR1_JOB_TITLE || "Supervisor Lapangan A",
    },
    {
      name: process.env.SEED_SUPERVISOR2_NAME || "Rudi Hartono",
      username: process.env.SEED_SUPERVISOR2_USERNAME || "supervisor2",
      phone: process.env.SEED_SUPERVISOR2_PHONE || "081100000004",
      password: process.env.SEED_SUPERVISOR2_PASSWORD || defPass,
      role: Role.SUPERVISOR,
      jobTitle: process.env.SEED_SUPERVISOR2_JOB_TITLE || "Supervisor Lapangan B",
    },
  ];
}

async function upsertUser(cfg: SeedUserConfig) {
  const passwordHash = await bcrypt.hash(cfg.password, 10);
  return prisma.user.upsert({
    where: { username: cfg.username },
    update: { name: cfg.name, phone: cfg.phone, jobTitle: cfg.jobTitle },
    create: {
      name: cfg.name,
      username: cfg.username,
      phone: cfg.phone,
      passwordHash,
      role: cfg.role,
      jobTitle: cfg.jobTitle,
    },
  });
}

async function upsertArea(projectId: string, code: string, name: string) {
  return prisma.area.upsert({
    where: { projectId_code: { projectId, code } },
    update: { name },
    create: { projectId, code, name },
  });
}

async function ensureActiveAssignment(
  areaId: string,
  supervisorId: string,
  assignedById: string,
  startDate: Date,
) {
  const existing = await prisma.areaAssignment.findFirst({
    where: { areaId, endDate: null },
  });
  if (existing) return existing;
  return prisma.areaAssignment.create({
    data: { areaId, supervisorId, assignedById, startDate },
  });
}

async function seedProjectAndAreas(
  ownerId: string,
  spv1Id: string,
  spv2Id: string,
) {
  const project = await prisma.project.upsert({
    where: { code: "VLA01" },
    update: {},
    create: {
      code: "VLA01",
      name: "Pembangunan Villa Canggu",
      location: "Canggu, Badung, Bali",
      clientName: "Ibu Clara Wijaya",
      startDate: new Date("2026-11-01T00:00:00.000Z"),
      status: ProjectStatus.BERJALAN,
      timezone: "Asia/Makassar",
      routineHolidays: [0],
    },
  });
  const areaA = await upsertArea(project.id, "A", "Struktur Utama & Atap");
  const areaB = await upsertArea(project.id, "B", "Finishing Interior & Kolam");
  const startDate = new Date("2026-11-01T00:00:00.000Z");
  await ensureActiveAssignment(areaA.id, spv1Id, ownerId, startDate);
  await ensureActiveAssignment(areaB.id, spv2Id, ownerId, startDate);
  return project;
}

function printSeedSummary(users: SeedUserConfig[]) {
  process.stdout.write("\n================ SEED DATABASE BERHASIL ================\n");
  process.stdout.write("Akun Pengguna yang Siap Digunakan untuk Pengujian:\n");
  for (const u of users) {
    process.stdout.write(
      ` -> [${u.role.padEnd(10)}] User: ${u.username.padEnd(12)} Sandi: ${u.password.padEnd(16)} (${u.name})\n`,
    );
  }
  process.stdout.write("Sample Project: [VLA01] Pembangunan Villa Canggu (Asia/Makassar)\n");
  process.stdout.write(" - Area A: Penugasan Aktif -> Supervisor 1\n");
  process.stdout.write(" - Area B: Penugasan Aktif -> Supervisor 2\n");
  process.stdout.write("========================================================\n\n");
}

async function main() {
  const configs = getUserSeedConfigs();
  const [ownerCfg, , spv1Cfg, spv2Cfg] = configs;
  if (!ownerCfg || !spv1Cfg || !spv2Cfg) {
    throw new Error("Konfigurasi seed pengguna tidak valid.");
  }
  const createdUsers = new Map<string, string>();
  for (const cfg of configs) {
    const user = await upsertUser(cfg);
    createdUsers.set(cfg.username, user.id);
  }
  const ownerId = createdUsers.get(ownerCfg.username);
  const spv1Id = createdUsers.get(spv1Cfg.username);
  const spv2Id = createdUsers.get(spv2Cfg.username);
  if (!ownerId || !spv1Id || !spv2Id) {
    throw new Error("Gagal menginisialisasi akun pengguna untuk seed.");
  }
  await seedProjectAndAreas(ownerId, spv1Id, spv2Id);
  printSeedSummary(configs);
}

main()
  .catch((err: unknown) => {
    process.stderr.write(`Gagal menjalankan seed: ${String(err)}\n`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
