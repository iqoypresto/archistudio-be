import { PayeeType, PaymentStatus, Prisma, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { PaymentRepository } from "../src/features/payment/payment.repository.js";
import { PaymentService } from "../src/features/payment/payment.service.js";
import { StoredFileRepository } from "../src/features/upload/stored-file.repository.js";
import { StoredFileService } from "../src/features/upload/stored-file.service.js";
import { UploadRepository } from "../src/features/upload/upload.repository.js";
import { UploadService } from "../src/features/upload/upload.service.js";
import type { AuthenticatedUser } from "../src/types/express.d.js";
import { signAccessToken } from "../src/utils/auth/jwt.util.js";
import { invokeApp } from "./helpers/invoke-app.helper.js";

vi.mock("../src/configs/prisma-client.config.js", () => ({ prisma: {} }));

interface ApiEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

const PERSON_ID = "11111111-1111-4111-8111-111111111111";
const RECORD_ID = "22222222-2222-4222-8222-222222222222";
const PROOF_FILE_ID = "33333333-3333-4333-8333-333333333333";
const now = new Date("2026-11-20T00:00:00.000Z");

const ownerActor: AuthenticatedUser = { id: "u-owner", role: Role.OWNER, username: "owner", name: "Owner", jobTitle: "Owner" };
const adminActor: AuthenticatedUser = { id: "u-admin", role: Role.ADMIN, username: "admin", name: "Admin", jobTitle: "Admin" };
const supActor: AuthenticatedUser = { id: "u-sup", role: Role.SUPERVISOR, username: "sup", name: "Sup", jobTitle: "Supervisor" };

const makeToken = (actor: AuthenticatedUser) =>
  signAccessToken({ sub: actor.id, role: actor.role, username: actor.username, name: actor.name, jobTitle: actor.jobTitle });

function makeRawRecord(overrides?: Partial<{ status: PaymentStatus; proofStoredFileId: string | null }>) {
  const proofStoredFileId = overrides?.proofStoredFileId ?? null;
  return {
    id: RECORD_ID,
    payeeId: PERSON_ID,
    status: overrides?.status ?? PaymentStatus.PAID,
    amount: new Prisma.Decimal("1500000.00"),
    recordDate: new Date("2026-11-20T00:00:00.000Z"),
    dueDate: new Date("2026-11-25T00:00:00.000Z"),
    proofStoredFileId,
    proofFile: proofStoredFileId
      ? { fileName: "bukti.jpg", mimeType: "image/jpeg", sizeBytes: 245000 }
      : null,
    createdById: ownerActor.id,
    createdAt: now,
    updatedAt: now,
  };
}

describe("TASK-16 Pembayaran Freelance/Agent Global (US-17, AC-17.1, BR-36)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("[AC-17.1 / BR-36] OWNER berhasil menambah orang (HP opsional) & membaca daftar beserta ringkasan", async () => {
    vi.spyOn(PaymentRepository, "createPerson").mockResolvedValue({
      id: PERSON_ID,
      type: PayeeType.FREELANCE,
      name: "Budi Drafter",
      phone: null,
      createdAt: now,
      updatedAt: now,
      payments: [],
    });
    const createRes = await invokeApp<ApiEnvelope<{ id: string; phone: string | null }>>(app, {
      method: "POST",
      path: "/api/v1/payments/people",
      headers: { Authorization: `Bearer ${makeToken(ownerActor)}` },
      body: { type: "FREELANCE", name: "Budi Drafter" },
    });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data?.id).toBe(PERSON_ID);
    expect(createRes.body.data?.phone).toBeNull();

    vi.spyOn(PaymentRepository, "findPeople").mockResolvedValue([
      {
        id: PERSON_ID,
        type: PayeeType.FREELANCE,
        name: "Budi Drafter",
        phone: "08123456789",
        createdAt: now,
        updatedAt: now,
        payments: [
          { status: PaymentStatus.PAID, amount: new Prisma.Decimal("1000000"), recordDate: now, dueDate: null },
          { status: PaymentStatus.UNPAID, amount: new Prisma.Decimal("500000"), recordDate: now, dueDate: new Date("2026-11-10T00:00:00.000Z") },
        ],
      },
    ]);
    const listRes = await invokeApp<
      ApiEnvelope<
        Array<{
          summary: {
            totalPaid: number;
            totalUnpaid: number;
            overdueUnpaidCount?: number;
            nearestDueDate?: string | null;
          };
        }>
      >
    >(app, {
      method: "GET",
      path: "/api/v1/payments/people?type=FREELANCE",
      headers: { Authorization: `Bearer ${makeToken(ownerActor)}` },
    });
    expect(listRes.status).toBe(200);
    expect(listRes.body.data?.[0]?.summary.totalPaid).toBe(1000000);
    expect(listRes.body.data?.[0]?.summary.totalUnpaid).toBe(500000);
    expect(listRes.body.data?.[0]?.summary.overdueUnpaidCount).toBe(1);
    expect(listRes.body.data?.[0]?.summary.nearestDueDate).toBe("2026-11-10");
  });

  it("[AC-17.1 / BR-36] OWNER membuat & mengubah catatan pembayaran serta menyediakan proofContentPath", async () => {
    vi.spyOn(PaymentRepository, "findPersonById").mockResolvedValue({ id: PERSON_ID, type: PayeeType.AGENT });
    vi.spyOn(StoredFileService, "assertAttachable").mockResolvedValue();
    vi.spyOn(PaymentRepository, "createRecord").mockResolvedValue(makeRawRecord({ proofStoredFileId: PROOF_FILE_ID }));

    const created = await invokeApp<ApiEnvelope<{ amount: number; proofContentPath: string }>>(app, {
      method: "POST",
      path: `/api/v1/payments/people/${PERSON_ID}/records`,
      headers: { Authorization: `Bearer ${makeToken(ownerActor)}` },
      body: {
        status: "PAID",
        amount: 1500000,
        recordDate: "2026-11-20",
        dueDate: "2026-11-25",
        proof: { storedFileId: PROOF_FILE_ID },
      },
    });
    expect(created.status).toBe(201);
    expect(created.body.data?.amount).toBe(1500000);
    expect(created.body.data?.proofContentPath).toBe(`/files/${PROOF_FILE_ID}/content`);

    vi.spyOn(PaymentRepository, "findRecordsByPersonId").mockResolvedValue([makeRawRecord({ proofStoredFileId: PROOF_FILE_ID })]);
    const records = await PaymentService.getRecordsByPerson(ownerActor, PERSON_ID, {});
    expect(records[0]?.proofContentPath).toBe(`/files/${PROOF_FILE_ID}/content`);

    vi.spyOn(PaymentRepository, "findRecordById").mockResolvedValue(makeRawRecord({ status: PaymentStatus.UNPAID }));
    vi.spyOn(PaymentRepository, "updateRecord").mockResolvedValue(makeRawRecord({ status: PaymentStatus.PAID }));
    const patched = await invokeApp<ApiEnvelope<{ status: string }>>(app, {
      method: "PATCH",
      path: `/api/v1/payments/records/${RECORD_ID}`,
      headers: { Authorization: `Bearer ${makeToken(ownerActor)}` },
      body: { status: "PAID" },
    });
    expect(patched.status).toBe(200);
    expect(patched.body.data?.status).toBe("PAID");
  });

  it("[AC-17.1 / BR-36] Menolak bukti non-JPG/PNG (400), > 2 MB (413), dan referensi file invalid (400)", async () => {
    vi.spyOn(UploadRepository, "payeeExists").mockResolvedValue(true);

    await expect(
      UploadService.createSession(
        {
          purpose: "payment-proof",
          payeeId: PERSON_ID,
          file: { fileName: "x.pdf", contentType: "application/pdf", fileSizeBytes: 1000 },
        },
        ownerActor,
      ),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_FILE_TYPE", statusCode: 400 });

    await expect(
      UploadService.createSession(
        {
          purpose: "payment-proof",
          payeeId: PERSON_ID,
          file: { fileName: "big.jpg", contentType: "image/jpeg", fileSizeBytes: 3 * 1024 * 1024 },
        },
        ownerActor,
      ),
    ).rejects.toMatchObject({ code: "FILE_TOO_LARGE", statusCode: 413 });

    vi.spyOn(PaymentRepository, "findPersonById").mockResolvedValue({ id: PERSON_ID, type: PayeeType.FREELANCE });
    vi.spyOn(StoredFileRepository, "findById").mockResolvedValue(null);
    await expect(
      PaymentService.createRecord(ownerActor, PERSON_ID, {
        status: PaymentStatus.PAID,
        amount: 500000,
        recordDate: "2026-11-20",
        proof: { storedFileId: PROOF_FILE_ID },
      }),
    ).rejects.toMatchObject({ code: "INVALID_FILE_REFERENCE", statusCode: 400 });
  });

  it("[AC-17.1 / BR-36] ADMIN & SUPERVISOR ditolak 403 FORBIDDEN pada endpoint pembayaran & sesi upload payment-proof", async () => {
    const adminHeaders = { Authorization: `Bearer ${makeToken(adminActor)}` };
    const supHeaders = { Authorization: `Bearer ${makeToken(supActor)}` };

    const [aGet, sPost, aUpload] = await Promise.all([
      invokeApp<ApiEnvelope>(app, { method: "GET", path: "/api/v1/payments/people", headers: adminHeaders }),
      invokeApp<ApiEnvelope>(app, { method: "POST", path: "/api/v1/payments/people", headers: supHeaders, body: { type: "AGENT", name: "X" } }),
      invokeApp<ApiEnvelope>(app, {
        method: "POST",
        path: "/api/v1/uploads/sessions",
        headers: adminHeaders,
        body: { purpose: "payment-proof", payeeId: PERSON_ID, file: { fileName: "a.jpg", contentType: "image/jpeg", fileSizeBytes: 1024 } },
      }),
    ]);

    expect([aGet.status, sPost.status, aUpload.status]).toEqual([403, 403, 403]);
  });

  it("[Validation] Menolak nama kosong & nominal <= 0 dengan 422 VALIDATION_ERROR", async () => {
    const headers = { Authorization: `Bearer ${makeToken(ownerActor)}` };
    const [badName, badAmount] = await Promise.all([
      invokeApp<ApiEnvelope>(app, { method: "POST", path: "/api/v1/payments/people", headers, body: { type: "AGENT", name: "  " } }),
      invokeApp<ApiEnvelope>(app, {
        method: "POST",
        path: `/api/v1/payments/people/${PERSON_ID}/records`,
        headers,
        body: { status: "UNPAID", amount: 0, recordDate: "2026-11-20" },
      }),
    ]);
    expect(badName.status).toBe(422);
    expect(badAmount.status).toBe(422);
  });
});
