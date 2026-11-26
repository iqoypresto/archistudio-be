const SIGNATURES: Record<string, (bytes: Buffer) => boolean> = {
  "image/jpeg": (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  "image/png": (bytes) => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  "image/webp": (bytes) => bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP",
  "application/pdf": (bytes) => bytes.toString("ascii", 0, 5) === "%PDF-",
  "application/msword": (bytes) => bytes.subarray(0, 8).equals(Buffer.from([208, 207, 17, 224, 161, 177, 26, 225])),
  "application/vnd.ms-excel": (bytes) => bytes.subarray(0, 8).equals(Buffer.from([208, 207, 17, 224, 161, 177, 26, 225])),
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (bytes) =>
    bytes.toString("ascii", 0, 4) === "PK\u0003\u0004" &&
    bytes.includes(Buffer.from("[Content_Types].xml")) && bytes.includes(Buffer.from("word/")),
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": (bytes) =>
    bytes.toString("ascii", 0, 4) === "PK\u0003\u0004" &&
    bytes.includes(Buffer.from("[Content_Types].xml")) && bytes.includes(Buffer.from("xl/")),
};

const FULL_CONTENT_SIGNATURE_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export function requiresFullContentSignatureCheck(mimeType: string): boolean {
  return FULL_CONTENT_SIGNATURE_TYPES.has(mimeType);
}

export function hasExpectedFileSignature(mimeType: string, bytes: Buffer): boolean {
  return SIGNATURES[mimeType]?.(bytes) ?? false;
}
