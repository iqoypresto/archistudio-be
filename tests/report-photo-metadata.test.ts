import { afterEach, describe, expect, it, vi } from "vitest";
import { enrichReportPhotoMetadata } from "../src/features/report/report.metadata.js";
import { normalizePhotoTakenAt } from "../src/features/report/report.photo-time.js";
import { StorageAdapter } from "../src/utils/storage/storage.adapter.js";

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

  it("[AC-16.1 / AC-16.2] stores LastModified separately even when EXIF is absent", async () => {
    vi.spyOn(StorageAdapter, "getObjectLastModified").mockResolvedValue({
      exists: true,
      lastModified: new Date("2026-11-19T03:20:00.000Z"),
    });
    const result = await enrichReportPhotoMetadata(
      [{ storageKey: "projects/p/areas/a/photo.jpg", sortOrder: 0, takenAt: null }],
      "Asia/Jakarta",
    );
    expect(result?.[0]).toMatchObject({
      takenAt: null,
      uploadedAt: "2026-11-19T03:20:00.000Z",
    });
  });

  it("[BR-23] rejects a photo key whose object is absent from storage", async () => {
    vi.spyOn(StorageAdapter, "getObjectLastModified").mockResolvedValue({
      exists: false,
      lastModified: null,
    });
    await expect(
      enrichReportPhotoMetadata(
        [{ storageKey: "projects/p/areas/a/missing.jpg", sortOrder: 0 }],
        "Asia/Jakarta",
      ),
    ).rejects.toMatchObject({ code: "INVALID_STORAGE_KEY" });
  });
});
