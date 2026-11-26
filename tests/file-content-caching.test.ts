import { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { Duplex, Readable } from "node:stream";
import { Role, StoredFileStatus } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { FileRepository } from "../src/features/upload/file.repository.js";
import { signAccessToken } from "../src/utils/auth/jwt.util.js";
import * as driveFileAdapter from "../src/utils/storage/drive-file.adapter.js";

vi.mock("../src/configs/prisma-client.config.js", () => ({ prisma: {} }));

const STORED_FILE_ID = "55555555-5555-4555-8555-555555555555";

class RawMemorySocket extends Duplex {
  remoteAddress = "127.0.0.1";
  private readonly chunks: Buffer[] = [];

  constructor() {
    super({ autoDestroy: false, emitClose: false });
  }

  override _read(): void {}

  override _write(chunk: Buffer | string, enc: BufferEncoding, cb: (err?: Error | null) => void): void {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, enc));
    cb();
  }

  extractRawBody(): string {
    const raw = Buffer.concat(this.chunks).toString("utf8");
    const idx = raw.indexOf("\r\n\r\n");
    return idx >= 0 ? raw.slice(idx + 4) : raw;
  }
}

function invokeRaw(path: string, headers: Record<string, string>) {
  return new Promise<{ status: number; headers: Record<string, string | string[] | number | undefined>; body: string }>(
    (resolve, reject) => {
      const reqSocket = new RawMemorySocket();
      const resSocket = new RawMemorySocket();
      const req = new IncomingMessage(reqSocket as unknown as Socket);
      req.method = "GET";
      req.url = path;
      req.headers = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
      const res = new ServerResponse(req);
      res.useChunkedEncodingByDefault = false;
      res.assignSocket(resSocket as unknown as Socket);
      res.on("finish", () => {
        resolve({ status: res.statusCode, headers: res.getHeaders(), body: resSocket.extractRawBody() });
      });
      res.on("error", reject);
      (app as unknown as (r: IncomingMessage, s: ServerResponse) => void)(req, res);
      process.nextTick(() => req.push(null));
    },
  );
}

function ownerHeader() {
  const token = signAccessToken({
    sub: "owner-1",
    role: Role.OWNER,
    username: "owner",
    name: "Owner Studio",
    jobTitle: "Owner",
  });
  return { Authorization: `Bearer ${token}` };
}

function mockStoredImage() {
  return vi.spyOn(FileRepository, "findById").mockResolvedValue({
    id: STORED_FILE_ID,
    driveFileId: "drive-file-1",
    fileName: "denah.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 9,
    status: StoredFileStatus.READY,
    reportPhoto: {
      report: {
        supervisorId: "sup-1",
        area: { assignments: [], project: { siteManagerId: null } },
      },
    },
    paymentRecord: null,
    drawing: null,
    projectDocument: null,
    commsEntry: null,
  } as never);
}

describe("GET /api/v1/files/:storedFileId/content caching & thumbnail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mengembalikan header Cache-Control private, ETag, Vary, dan mendukung 304 Not Modified", async () => {
    mockStoredImage();
    const streamSpy = vi.spyOn(driveFileAdapter, "streamDriveFile").mockResolvedValue({
      body: Readable.from([Buffer.from("full-data")]),
      mimeType: "image/jpeg",
    });

    const firstRes = await invokeRaw(`/api/v1/files/${STORED_FILE_ID}/content`, ownerHeader());
    expect(firstRes.status).toBe(200);
    expect(firstRes.body).toBe("full-data");
    expect(firstRes.headers["cache-control"]).toBe("private, max-age=3600");
    expect(firstRes.headers["vary"]).toBe("Authorization");
    expect(firstRes.headers["etag"]).toBe(`"${STORED_FILE_ID}-full"`);
    expect(streamSpy).toHaveBeenCalledTimes(1);

    const cachedRes = await invokeRaw(`/api/v1/files/${STORED_FILE_ID}/content`, {
      ...ownerHeader(),
      "If-None-Match": `"${STORED_FILE_ID}-full"`,
    });
    expect(cachedRes.status).toBe(304);
    expect(cachedRes.headers["etag"]).toBe(`"${STORED_FILE_ID}-full"`);
    expect(streamSpy).toHaveBeenCalledTimes(1);
  });

  it("mendukung ?variant=thumb via thumbnail Drive dan fallback ke full jika thumbnail tidak tersedia", async () => {
    mockStoredImage();
    const thumbSpy = vi
      .spyOn(driveFileAdapter, "streamDriveThumbnail")
      .mockResolvedValueOnce({
        body: Readable.from([Buffer.from("thumb")]),
        mimeType: "image/webp",
        sizeBytes: 5,
      })
      .mockResolvedValueOnce(null);
    const fullSpy = vi.spyOn(driveFileAdapter, "streamDriveFile").mockResolvedValue({
      body: Readable.from([Buffer.from("full-data")]),
      mimeType: "image/jpeg",
    });

    const thumbRes = await invokeRaw(`/api/v1/files/${STORED_FILE_ID}/content?variant=thumb`, ownerHeader());
    expect(thumbRes.status).toBe(200);
    expect(thumbRes.body).toBe("thumb");
    expect(thumbRes.headers["content-type"]).toBe("image/webp");
    expect(thumbRes.headers["etag"]).toBe(`"${STORED_FILE_ID}-thumb"`);
    expect(thumbSpy).toHaveBeenCalledTimes(1);
    expect(fullSpy).toHaveBeenCalledTimes(0);

    const fallbackRes = await invokeRaw(`/api/v1/files/${STORED_FILE_ID}/content?variant=thumb`, ownerHeader());
    expect(fallbackRes.status).toBe(200);
    expect(fallbackRes.body).toBe("full-data");
    expect(fallbackRes.headers["content-type"]).toBe("image/jpeg");
    expect(fallbackRes.headers["etag"]).toBe(`"${STORED_FILE_ID}-full"`);
    expect(fullSpy).toHaveBeenCalledTimes(1);
  });

  it("menolak parameter variant yang tidak valid dan mengubah dimensi URL thumbnail Drive", async () => {
    const badRes = await invokeRaw(`/api/v1/files/${STORED_FILE_ID}/content?variant=huge`, ownerHeader());
    expect(badRes.status).toBe(422);
    expect(JSON.parse(badRes.body).error?.code).toBe("VALIDATION_ERROR");

    expect(
      driveFileAdapter.resizeDriveThumbnailLink("https://lh3.googleusercontent.com/drive-storage/abc=s220", 800),
    ).toBe("https://lh3.googleusercontent.com/drive-storage/abc=s800");
  });
});
