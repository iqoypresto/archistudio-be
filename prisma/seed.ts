import "dotenv/config";
import { ProjectStatus, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../src/configs/prisma-client.config.js";

/** Membuat atau memperbarui satu akun user internal secara idempoten. */
async function upsertUser(input: {
  name: string;
  username: string;
  phone: string;
  passwordHash: string;
  role: Role;
  jobTitle: string;
}) {
  return prisma.user.upsert({
    where: { username: input.username },
    update: {},
    create: input,
  });
}

/** Seed 3 role inti Fase 1: OWNER, ADMIN, dan SUPERVISOR (BR-01 s/d BR-04). */
async function seedUsers(passwordHash: string) {
  const owner = await upsertUser({
    name: "Budi Santoso (Owner)",
    username: "owner",
    phone: "081100000001",
    passwordHash,
    role: Role.OWNER,
    jobTitle: "Owner / Direktur",
  });
  await upsertUser({
    name: "Siti Rahma (Admin)",
    username: "admin",
    phone: "081100000002",
    passwordHash,
    role: Role.ADMIN,
    jobTitle: "Admin Proyek",
  });
  const supervisor = await upsertUser({
    name: "Ahmad Fauzi",
    username: "supervisor1",
    phone: "081100000003",
    passwordHash,
    role: Role.SUPERVISOR,
    jobTitle: "Supervisor Lapangan",
  });
  return { owner, supervisor };
}

/** Seed project sampel dan dua area kerja (A dan B) secara idempoten. */
async function seedProjectAndAreas(startDate: Date) {
  const project = await prisma.project.upsert({
    where: { code: "VLA01" },
    update: {},
    create: {
      code: "VLA01",
      name: "Pembangunan Villa Canggu",
      location: "Canggu, Badung, Bali",
      clientName: "Ibu Clara Wijaya",
      startDate,
      status: ProjectStatus.BERJALAN,
      timezone: "Asia/Makassar",
      routineHolidays: [0],
    },
  });
  const areaA = await upsertArea(project.id, "A", "Struktur Utama & Atap");
  await upsertArea(project.id, "B", "Finishing Interior & Kolam");
  return areaA;
}

/** Upsert satu area di dalam project berdasarkan pasangan (projectId, code). */
async function upsertArea(projectId: string, code: string, name: string) {
  return prisma.area.upsert({
    where: { projectId_code: { projectId, code } },
    update: {},
    create: { projectId, code, name },
  });
}

/** Menetapkan supervisor1 sebagai penanggung jawab aktif pada Area A (BR-08). */
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

/** Titik masuk eksekusi database seed awal M0. */
async function main() {
  const passwordHash = await bcrypt.hash("ArchiStudio2026!", 10);
  const startDate = new Date("2026-11-01T00:00:00.000Z");
  const { owner, supervisor } = await seedUsers(passwordHash);
  const areaA = await seedProjectAndAreas(startDate);
  await ensureActiveAssignment(areaA.id, supervisor.id, owner.id, startDate);
}

main()
  .catch((err: unknown) => {
    process.stderr.write(`Gagal menjalankan seed: ${String(err)}\n`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
