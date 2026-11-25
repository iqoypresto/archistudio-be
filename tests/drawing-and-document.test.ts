import { ProjectDocumentType, ProjectStatus, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { DrawingRepository } from "../src/features/drawing/drawing.repository.js";
import { DrawingService } from "../src/features/drawing/drawing.service.js";
import { ProjectDocumentRepository } from "../src/features/project-document/project-document.repository.js";
import { ProjectDocumentService } from "../src/features/project-document/project-document.service.js";
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

describe("TASK-19 & REV-02 Drawing (1 Arah) & Dokumen Keluar Project (US-18, US-19, BR-32..BR-34)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("[AC-18.1 / BR-32] Semua 4 role berhak dapat melihat galeri Drawing (tanpa In/Out); SUPERVISOR/SM lintas project ditolak 403", async () => {
    const key = `projects/${PROJ_ID}/drawings/a.webp`;
    vi.spyOn(ProjectRepository, "findById").mockResolvedValueOnce(makeProject()).mockResolvedValueOnce(makeProject());
    vi.spyOn(DrawingRepository, "findManyByProject").mockResolvedValue([
      { id: "drw-1", projectId: PROJ_ID, storageKey: key, fileName: "denah.webp", mimeType: "image/webp", sizeBytes: 512000, uploadedAt: now, archivedAt: null },
    ]);
    vi.spyOn(StorageAdapter, "createSignedViewUrlsMap").mockResolvedValue({ [key]: "https://r2.local/drw" });

    const supOk = await invokeApp<ApiEnvelope<Array<{ viewUrl: string }>>>(app, {
      method: "GET",
      path: `/api/v1/projects/${PROJ_ID}/drawings`,
      headers: { Authorization: `Bearer ${makeToken(supActor)}` },
    });
    expect(supOk.status).toBe(200);
    expect(supOk.body.data?.[0]?.viewUrl).toBe("https://r2.local/drw");

    const smOk = await invokeApp<ApiEnvelope<Array<{ viewUrl: string }>>>(app, {
      method: "GET",
      path: `/api/v1/projects/${PROJ_ID}/drawings`,
      headers: { Authorization: `Bearer ${makeToken(smActor)}` },
    });
    expect(smOk.status).toBe(200);

    vi.spyOn(ProjectRepository, "findById")
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeProject());
    await expect(
      DrawingService.listDrawings(supActor, PROJ_ID, { includeArchived: false }),
    ).rejects.toMatchObject({ code: "AREA_SCOPE_FORBIDDEN", statusCode: 403 });
  });

  it("[AC-18.1 / BR-32, BR-33] OWNER unggah & arsip Drawing (tanpa direction); ADMIN/SM/SUPERVISOR ditolak 403; tipe/ukuran invalid ditolak", async () => {
    const key = `projects/${PROJ_ID}/drawings/b.png`;
    vi.spyOn(ProjectRepository, "findById").mockResolvedValue(makeProject());
    vi.spyOn(DrawingRepository, "create").mockResolvedValue({
      id: "drw-2", projectId: PROJ_ID, storageKey: key, fileName: "tampak.png", mimeType: "image/png", sizeBytes: 1024000, uploadedAt: now, archivedAt: null,
    });
    vi.spyOn(StorageAdapter, "createSignedViewUrl").mockResolvedValue("https://r2.local/drw-2");

    const ownerCreate = await invokeApp<ApiEnvelope<{ id: string }>>(app, {
      method: "POST",
      path: `/api/v1/projects/${PROJ_ID}/drawings`,
      headers: { Authorization: `Bearer ${makeToken(ownerActor)}` },
      body: { storageKey: key, fileName: "tampak.png", mimeType: "image/png", sizeBytes: 1024000 },
    });
    expect(ownerCreate.status).toBe(201);

    vi.spyOn(DrawingRepository, "findByIdWithProject").mockResolvedValue({
      id: "drw-2", projectId: PROJ_ID, storageKey: key, fileName: "tampak.png", mimeType: "image/png", sizeBytes: 1024000, uploadedAt: now, archivedAt: null,
      project: { status: ProjectStatus.BERJALAN, archivedAt: null, deletedAt: null },
    });
    vi.spyOn(DrawingRepository, "markArchived").mockResolvedValue({
      id: "drw-2", projectId: PROJ_ID, storageKey: key, fileName: "tampak.png", mimeType: "image/png", sizeBytes: 1024000, uploadedAt: now, archivedAt: now,
    });
    const archivedRes = await invokeApp<ApiEnvelope<{ archivedAt: string }>>(app, {
      method: "POST",
      path: "/api/v1/drawings/drw-2/archive",
      headers: { Authorization: `Bearer ${makeToken(ownerActor)}` },
    });
    expect(archivedRes.status).toBe(200);

    const [adminPost, smPost] = await Promise.all([
      invokeApp<ApiEnvelope>(app, {
        method: "POST",
        path: `/api/v1/projects/${PROJ_ID}/drawings`,
        headers: { Authorization: `Bearer ${makeToken(adminActor)}` },
        body: { storageKey: key, fileName: "x.png", mimeType: "image/png", sizeBytes: 1000 },
      }),
      invokeApp<ApiEnvelope>(app, {
        method: "POST",
        path: `/api/v1/projects/${PROJ_ID}/drawings`,
        headers: { Authorization: `Bearer ${makeToken(smActor)}` },
        body: { storageKey: key, fileName: "x.png", mimeType: "image/png", sizeBytes: 1000 },
      }),
    ]);
    expect([adminPost.status, smPost.status]).toEqual([403, 403]);

    await expect(
      DrawingService.createDrawing(ownerActor, PROJ_ID, {
        storageKey: `projects/${PROJ_ID}/drawings/a.pdf`, fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 1000,
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_FILE_TYPE", statusCode: 400 });

    await expect(
      DrawingService.createDrawing(ownerActor, PROJ_ID, {
        storageKey: `projects/${PROJ_ID}/drawings/big.jpg`, fileName: "big.jpg", mimeType: "image/jpeg", sizeBytes: 5 * 1024 * 1024,
      }),
    ).rejects.toMatchObject({ code: "FILE_TOO_LARGE", statusCode: 413 });
  });

  it("[AC-19.1 / BR-34] OWNER mengelola Dokumen Keluar (list, create PDF/Word/Excel <= 5 MB, delete permanen DB+R2)", async () => {
    const key = `projects/${PROJ_ID}/documents/QUOTATION/q1.pdf`;
    vi.spyOn(ProjectRepository, "findById").mockResolvedValue(makeProject());
    vi.spyOn(ProjectDocumentRepository, "create").mockResolvedValue({
      id: "doc-1", projectId: PROJ_ID, type: ProjectDocumentType.QUOTATION, storageKey: key, fileName: "Quotation-01.pdf", mimeType: "application/pdf", sizeBytes: 204800, uploadedAt: now,
    });
    vi.spyOn(StorageAdapter, "createSignedViewUrl").mockResolvedValue("https://r2.local/doc-1");

    const createRes = await invokeApp<ApiEnvelope<{ viewUrl: string }>>(app, {
      method: "POST",
      path: `/api/v1/projects/${PROJ_ID}/documents`,
      headers: { Authorization: `Bearer ${makeToken(ownerActor)}` },
      body: { type: "QUOTATION", storageKey: key, fileName: "Quotation-01.pdf", mimeType: "application/pdf", sizeBytes: 204800 },
    });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data?.viewUrl).toBe("https://r2.local/doc-1");

    vi.spyOn(ProjectDocumentRepository, "findByIdWithProject").mockResolvedValue({
      id: "doc-1", projectId: PROJ_ID, type: ProjectDocumentType.QUOTATION, storageKey: key, fileName: "Quotation-01.pdf", mimeType: "application/pdf", sizeBytes: 204800, uploadedAt: now,
      project: { status: ProjectStatus.BERJALAN, archivedAt: null, deletedAt: null },
    });
    const deleteObjSpy = vi.spyOn(StorageAdapter, "deleteObject").mockResolvedValue();
    const deleteDbSpy = vi.spyOn(ProjectDocumentRepository, "deleteById").mockResolvedValue();

    const delRes = await invokeApp<ApiEnvelope<{ deleted: boolean }>>(app, {
      method: "DELETE",
      path: "/api/v1/documents/doc-1",
      headers: { Authorization: `Bearer ${makeToken(ownerActor)}` },
    });
    expect(delRes.status).toBe(200);
    expect(deleteObjSpy).toHaveBeenCalledWith(key);
    expect(deleteDbSpy).toHaveBeenCalledWith("doc-1");
  });

  it("[AC-19.1 / BR-34, BR-12] ADMIN/SUPERVISOR ditolak 403; format/ukuran dokumen invalid & project arsip ditolak", async () => {
    const [adminGet, supDel] = await Promise.all([
      invokeApp<ApiEnvelope>(app, { method: "GET", path: `/api/v1/projects/${PROJ_ID}/documents`, headers: { Authorization: `Bearer ${makeToken(adminActor)}` } }),
      invokeApp<ApiEnvelope>(app, { method: "DELETE", path: "/api/v1/documents/doc-1", headers: { Authorization: `Bearer ${makeToken(supActor)}` } }),
    ]);
    expect([adminGet.status, supDel.status]).toEqual([403, 403]);

    vi.spyOn(ProjectRepository, "findById").mockResolvedValue(makeProject());
    await expect(
      ProjectDocumentService.createDocument(ownerActor, PROJ_ID, {
        type: ProjectDocumentType.INVOICE, storageKey: `projects/${PROJ_ID}/documents/INVOICE/a.png`, fileName: "a.png", mimeType: "image/png", sizeBytes: 1024,
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_FILE_TYPE", statusCode: 400 });

    await expect(
      ProjectDocumentService.createDocument(ownerActor, PROJ_ID, {
        type: ProjectDocumentType.BAST, storageKey: `projects/${PROJ_ID}/documents/BAST/big.pdf`, fileName: "big.pdf", mimeType: "application/pdf", sizeBytes: 6 * 1024 * 1024,
      }),
    ).rejects.toMatchObject({ code: "FILE_TOO_LARGE", statusCode: 413 });

    vi.spyOn(ProjectRepository, "findById").mockResolvedValue(makeProject(ProjectStatus.SELESAI));
    await expect(
      ProjectDocumentService.createDocument(ownerActor, PROJ_ID, {
        type: ProjectDocumentType.BAST, storageKey: `projects/${PROJ_ID}/documents/BAST/ok.pdf`, fileName: "ok.pdf", mimeType: "application/pdf", sizeBytes: 1024,
      }),
    ).rejects.toMatchObject({ code: "PROJECT_ALREADY_COMPLETED", statusCode: 422 });
  });
});
