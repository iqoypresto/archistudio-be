import { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { Duplex } from "node:stream";
import type { Express } from "express";

class MemorySocket extends Duplex {
  remoteAddress = "127.0.0.1";
  private readonly chunks: Buffer[] = [];

  constructor() {
    super({ autoDestroy: false, emitClose: false });
  }

  override _read(): void {}

  override _write(
    chunk: Buffer | string,
    enc: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, enc));
    callback();
  }

  extractBody(): string {
    const raw = Buffer.concat(this.chunks).toString("utf8");
    const headerEnd = raw.indexOf("\r\n\r\n");
    return headerEnd >= 0 ? raw.slice(headerEnd + 4) : raw;
  }
}

export interface InvokeAppOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/** Membentuk IncomingMessage in-memory beserta payload JSON bila ada. */
function buildIncomingRequest(options: InvokeAppOptions) {
  const reqSocket = new MemorySocket();
  const req = new IncomingMessage(reqSocket as unknown as Socket);
  const payload =
    options.body !== undefined ? Buffer.from(JSON.stringify(options.body)) : null;
  req.method = options.method;
  req.url = options.path;
  req.headers = Object.fromEntries(
    Object.entries(options.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );
  if (payload) {
    req.headers["content-type"] = "application/json";
    req.headers["content-length"] = String(payload.byteLength);
  }
  return { req, payload };
}

/** Menjalankan request ke pipeline Express di memori tanpa membuka soket TCP. */
export function invokeApp<T = Record<string, unknown>>(
  app: Express,
  options: InvokeAppOptions,
): Promise<{ status: number; body: T }> {
  return new Promise((resolve, reject) => {
    const resSocket = new MemorySocket();
    const { req, payload } = buildIncomingRequest(options);
    const res = new ServerResponse(req);
    res.useChunkedEncodingByDefault = false;
    res.assignSocket(resSocket as unknown as Socket);
    res.on("finish", () => {
      const rawBody = resSocket.extractBody();
      resolve({ status: res.statusCode, body: (rawBody ? JSON.parse(rawBody) : {}) as T });
    });
    res.on("error", reject);
    (app as unknown as (r: IncomingMessage, s: ServerResponse) => void)(req, res);
    process.nextTick(() => {
      if (payload) req.push(payload);
      req.push(null);
    });
  });
}
