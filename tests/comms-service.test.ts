import { CommsDirection, ProjectStatus, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { CommsRepository } from "../src/features/comms/comms.repository.js";
import { CommsService } from "../src/features/comms/comms.service.js";
import { ProjectRepository } from "../src/features/project/project.repository.js";
import type { AuthenticatedUser } from "../src/types/express.d.js";
import { signAccessToken } from "../src/utils/auth/jwt.util.js";
import { StorageAdapter } from "../src/utils/storage/storage.adapter.js";
import { invokeApp } from "./helpers/invoke-app.helper.js";

vi.mock("../src/configs/prisma-client.config.js", () => ({ prisma: {} }));

interface ApiEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

const PROJ_ID = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-11-20T00:00:00.000Z");
const ownerActor: AuthenticatedUser = { id: "u-owner", role: Role.OWNER, username: "owner", name: "Owner", jobTitle: "Owner" };
const adminActor: AuthenticatedUser = { id: "u-admin", role: Role.ADMIN, username: "admin", name: "Admin", jobTitle: "Admin" };
const smActor: AuthenticatedUser = { id: "u-sm", role: Role.SITE_MANAGER, username: "sm", name: "Site Manager", jobTitle: "Site Manager" };
const supActor: AuthenticatedUser = { id: "u-sup", role: Role.SUPERVISOR, username: "sup", name: "Sup", jobTitle: "Supervisor" };

const makeToken = (actor: AuthenticatedUser) =>
  signAccessToken({ sub: actor.id, role: actor.role, username: actor.username, name: actor.name, jobTitle: actor.jobTitle });

const makeProject = (status: ProjectStatus = ProjectStatus.BERJALAN, archivedAt: Date | null = null) => ({
  id: PROJ_ID,
  code: "VLA01",
  name: "Villa Ubud",
  location: "Ubud",
  clientName: "PT Graha",
  startDate: now,
  endDate: null,
  status,
  timezone: "Asia/Makassar",
  routineHolidays: [0],
  siteManagerId: smActor.id,
  completedAt: null,
  archivedAt,
  createdAt: now,
  updatedAt: now,
  areas: [],
});

const makeRawEntry = (creator: AuthenticatedUser = ownerActor, overrides: Partial<{ id: string; direction: CommsDirection }> = {}) => ({
  id: overrides.id ?? "comms-1",
  projectId: PROJ_ID,
  direction: overrides.direction ?? CommsDirection.INBOUND,
  entryDate: now,
  subject: "Konfirmasi Revisi Fasad",
  note: "Disetujui client via email",
  attachmentKey: `projects/${PROJ_ID}/comms-attachments/mom.pdf`,
  attachmentName: "MoM-Revisi.pdf",
  attachmentMime: "application/pdf",
  attachmentBytes: 120_000,
  createdById: creator.id,
  updatedById: null,
  createdBy: { id: creator.id, name: creator.name, role: creator.role },
  updatedBy: null,
  createdAt: now,
  updatedAt: now,
});

describe("TASK-20 & REV-03 Comms In & Out Project — 4 Role, Audit Trail & Edit Guard (US-20, AC-20.1, BR-35)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("[AC-20.1 / BR-35] OWNER membuat, membaca (+ attachmentViewUrl & createdBy), dan mengubah catatan Comms", async () => {
    const key = `projects/${PROJ_ID}/comms-attachments/mom.pdf`;
    const rawEntry = makeRawEntry(ownerActor);

    vi.spyOn(ProjectRepository, "findById").mockResolvedValue(makeProject());
    vi.spyOn(CommsRepository, "create").mockResolvedValue(rawEntry);
    vi.spyOn(StorageAdapter, "createSignedViewUrl").mockResolvedValue("https://r2.local/mom");

    const createRes = await invokeApp<ApiEnvelope<{ attachmentViewUrl: string; createdBy: { id: string } }>>(app, {
      method: "POST",
      path: `/api/v1/projects/${PROJ_ID}/comms`,
      headers: { Authorization: `Bearer ${makeToken(ownerActor)}` },
      body: {
        entryDate: "2026-11-20",
        direction: "INBOUND",
        subject: "Konfirmasi Revisi Fasad",
        note: "Disetujui client via email",
        attachment: { storageKey: key, fileName: "MoM-Revisi.pdf", mimeType: "application/pdf", sizeBytes: 120_000 },
      },
    });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data?.attachmentViewUrl).toBe("https://r2.local/mom");
    expect(createRes.body.data?.createdBy.id).toBe(ownerActor.id);

    vi.spyOn(CommsRepository, "findManyByProject").mockResolvedValue([rawEntry]);
    vi.spyOn(StorageAdapter, "createSignedViewUrlsMap").mockResolvedValue({ [key]: "https://r2.local/mom-list" });
    const listRes = await invokeApp<ApiEnvelope<Array<{ attachmentViewUrl: string }>>>(app, {
      method: "GET",
      path: `/api/v1/projects/${PROJ_ID}/comms?direction=INBOUND&dateFrom=2026-11-01&dateTo=2026-11-30`,
      headers: { Authorization: `Bearer ${makeToken(ownerActor)}` },
    });
    expect(listRes.status).toBe(200);
    expect(listRes.body.data?.[0]?.attachmentViewUrl).toBe("https://r2.local/mom-list");

    vi.spyOn(CommsRepository, "findByIdWithProject").mockResolvedValue({
      ...rawEntry,
      project: { status: ProjectStatus.BERJALAN, archivedAt: null, deletedAt: null },
    });
    vi.spyOn(CommsRepository, "update").mockResolvedValue({ ...rawEntry, direction: CommsDirection.OUTBOUND });
    const patchRes = await invokeApp<ApiEnvelope<{ direction: string }>>(app, {
      method: "PATCH",
      path: "/api/v1/comms/comms-1",
      headers: { Authorization: `Bearer ${makeToken(ownerActor)}` },
      body: { direction: "OUTBOUND" },
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data?.direction).toBe("OUTBOUND");
  });

  it("[AC-20.1 / BR-35] Menolak lampiran non-PDF/Word/Excel (400), > 5 MB (413), dan storageKey invalid (400)", async () => {
    vi.spyOn(ProjectRepository, "findById").mockResolvedValue(makeProject());
    const base = { entryDate: "2026-11-20", direction: CommsDirection.OUTBOUND, subject: "Surat" };

    await expect(
      CommsService.createEntry(ownerActor, PROJ_ID, {
        ...base,
        attachment: { storageKey: `projects/${PROJ_ID}/comms-attachments/a.png`, fileName: "a.png", mimeType: "image/png", sizeBytes: 1000 },
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_FILE_TYPE", statusCode: 400 });

    await expect(
      CommsService.createEntry(ownerActor, PROJ_ID, {
        ...base,
        attachment: { storageKey: `projects/${PROJ_ID}/comms-attachments/big.pdf`, fileName: "big.pdf", mimeType: "application/pdf", sizeBytes: 6 * 1024 * 1024 },
      }),
    ).rejects.toMatchObject({ code: "FILE_TOO_LARGE", statusCode: 413 });

    await expect(
      CommsService.createEntry(ownerActor, PROJ_ID, {
        ...base,
        attachment: { storageKey: "projects/other/comms-attachments/a.pdf", fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 1000 },
      }),
    ).rejects.toMatchObject({ code: "INVALID_STORAGE_KEY", statusCode: 400 });
  });

  it("[AC-20.1 / D-05, K-02] 4 role boleh baca/buat sesuai scope; Edit hanya pembuat sendiri atau OWNER", async () => {
    const smEntry = makeRawEntry(smActor, { id: "comms-sm" });
    vi.spyOn(ProjectRepository, "findById").mockResolvedValue(makeProject());
    vi.spyOn(CommsRepository, "create").mockResolvedValue(smEntry);
    vi.spyOn(StorageAdapter, "createSignedViewUrl").mockResolvedValue("https://r2.local/sm");

    const smCreate = await invokeApp<ApiEnvelope<{ createdBy: { role: string } }>>(app, {
      method: "POST",
      path: `/api/v1/projects/${PROJ_ID}/comms`,
      headers: { Authorization: `Bearer ${makeToken(smActor)}` },
      body: { entryDate: "2026-11-20", direction: "OUTBOUND", subject: "Koordinasi Logistik" },
    });
    expect(smCreate.status).toBe(201);
    expect(smCreate.body.data?.createdBy.role).toBe(Role.SITE_MANAGER);

    vi.spyOn(CommsRepository, "findByIdWithProject").mockResolvedValue({
      ...smEntry,
      project: { status: ProjectStatus.BERJALAN, archivedAt: null, deletedAt: null },
    });
    vi.spyOn(CommsRepository, "update").mockResolvedValue(smEntry);

    // Non-creator ADMIN ditolak edit catatan milik Site Manager
    const adminEditOther = await invokeApp<ApiEnvelope>(app, {
      method: "PATCH",
      path: "/api/v1/comms/comms-sm",
      headers: { Authorization: `Bearer ${makeToken(adminActor)}` },
      body: { subject: "Coba ubah" },
    });
    expect(adminEditOther.status).toBe(403);

    // Pembuat sendiri (SITE_MANAGER) & OWNER diizinkan edit
    const [smEditOwn, ownerEditAny] = await Promise.all([
      invokeApp<ApiEnvelope>(app, {
        method: "PATCH",
        path: "/api/v1/comms/comms-sm",
        headers: { Authorization: `Bearer ${makeToken(smActor)}` },
        body: { subject: "Update SM" },
      }),
      invokeApp<ApiEnvelope>(app, {
        method: "PATCH",
        path: "/api/v1/comms/comms-sm",
        headers: { Authorization: `Bearer ${makeToken(ownerActor)}` },
        body: { subject: "Update Owner" },
      }),
    ]);
    expect([smEditOwn.status, ownerEditAny.status]).toEqual([200, 200]);

    // SUPERVISOR di luar scope project ditolak 403 AREA_SCOPE_FORBIDDEN
    vi.spyOn(ProjectRepository, "findById")
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeProject());
    const supOutScope = await invokeApp<ApiEnvelope>(app, {
      method: "GET",
      path: `/api/v1/projects/${PROJ_ID}/comms`,
      headers: { Authorization: `Bearer ${makeToken(supActor)}` },
    });
    expect(supOutScope.status).toBe(403);
    expect(supOutScope.body.error?.code).toBe("AREA_SCOPE_FORBIDDEN");
  });

  it("[BR-12 / BR-39 & Validation] Menolak mutasi pada project arsip (422) & validasi subjek/rentang tanggal invalid", async () => {
    vi.spyOn(ProjectRepository, "findById").mockResolvedValue(makeProject(ProjectStatus.BERJALAN, now));
    await expect(
      CommsService.createEntry(ownerActor, PROJ_ID, {
        entryDate: "2026-11-20",
        direction: CommsDirection.INBOUND,
        subject: "Catatan Arsip",
      }),
    ).rejects.toMatchObject({ code: "PROJECT_ALREADY_COMPLETED", statusCode: 422 });

    const headers = { Authorization: `Bearer ${makeToken(ownerActor)}` };
    const [badSubject, badRange] = await Promise.all([
      invokeApp<ApiEnvelope>(app, {
        method: "POST",
        path: `/api/v1/projects/${PROJ_ID}/comms`,
        headers,
        body: { entryDate: "2026-11-20", direction: "INBOUND", subject: "   " },
      }),
      invokeApp<ApiEnvelope>(app, {
        method: "GET",
        path: `/api/v1/projects/${PROJ_ID}/comms?dateFrom=2026-11-20&dateTo=2026-11-10`,
        headers,
      }),
    ]);
    expect(badSubject.status).toBe(422);
    expect(badRange.status).toBe(422);
  });
});
