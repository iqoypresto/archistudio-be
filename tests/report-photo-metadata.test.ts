import { StoragePurpose, StorageTargetType, StoredFileStatus } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { enrichReportPhotoMetadata } from "../src/features/report/report.metadata.js";
import { normalizePhotoTakenAt } from "../src/features/report/report.photo-time.js";
import { StoredFileRepository } from "../src/features/upload/stored-file.repository.js";
import { StoredFileService } from "../src/features/upload/stored-file.service.js";

describe("TASK-13 report photo metadata", () => {
  afterEach(() => vi.restoreAllMocks());

  it("[AC-16.1 / BR-23] normalizes EXIF with an explicit offset", () => {
    expect(
      normalizePhotoTakenAt("2026-11-19T10:15:30+07:00", "Asia/Jakarta")?.toISOString(),
    ).toBe("2026-11-19T03:15:30.000Z");
  });

  it("[AC-16.1 / BR-23] interprets EXIF without an offset in the project timezone", () => {
    expect(
      normalizePhotoTakenAt("2026-11-19T10:15:30", "Asia/Jakarta")?.toISOString(),
    ).toBe("2026-11-19T03:15:30.000Z");
  });

  it("[AC-16.2 / BR-23] converts missing or invalid EXIF to null", () => {
    expect(normalizePhotoTakenAt(null, "Asia/Jakarta")).toBeNull();
    expect(normalizePhotoTakenAt("2026-02-30T10:15:30", "Asia/Jakarta")).toBeNull();
  });

  it("[AC-16.1 / AC-16.2] normalizes takenAt per project timezone and preserves null when EXIF is absent", async () => {
    const result = await enrichReportPhotoMetadata(
      [
        { storedFileId: "66666666-6666-4666-8666-666666666666", sortOrder: 0, takenAt: "2026-11-19T10:15:30" },
        { storedFileId: "77777777-7777-4777-8777-777777777777", sortOrder: 1, takenAt: null },
      ],
      "Asia/Jakarta",
    );
    expect(result?.[0]).toMatchObject({
      storedFileId: "66666666-6666-4666-8666-666666666666",
      takenAt: "2026-11-19T03:15:30.000Z",
    });
    expect(result?.[1]).toMatchObject({
      storedFileId: "77777777-7777-4777-8777-777777777777",
      takenAt: null,
    });
  });

  it("[BR-23] rejects a storedFileId that is not READY in storage", async () => {
    vi.spyOn(StoredFileRepository, "findById").mockResolvedValue({
      status: StoredFileStatus.UPLOADING,
      purpose: StoragePurpose.REPORT_PHOTO,
      targetType: StorageTargetType.REPORT,
      targetId: "report-1",
      targetQualifier: null,
      uploadedById: "owner-1",
      uploadSession: null,
      reportPhoto: null,
      paymentRecord: null,
      drawing: null,
      projectDocument: null,
      commsEntry: null,
    } as never);
    await expect(
      StoredFileService.assertAttachable({
        storedFileId: "66666666-6666-4666-8666-666666666666",
        purpose: StoragePurpose.REPORT_PHOTO,
        targetType: StorageTargetType.REPORT,
        targetId: "report-1",
        uploadedById: "owner-1",
      }),
    ).rejects.toMatchObject({ code: "INVALID_FILE_REFERENCE" });
  });
});
