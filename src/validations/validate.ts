import { ZodError, type z } from "zod";
import { ResponseError, type ValidationErrorFields } from "../utils/errors/response-error.util.js";

/** Memetakan ZodError menjadi kamus field -> daftar pesan error. */
function mapZodIssues(error: ZodError): ValidationErrorFields {
  const fields: ValidationErrorFields = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "root";
    const list = fields[key] ?? [];
    list.push(issue.message);
    fields[key] = list;
  }
  return fields;
}

/** Memvalidasi payload terhadap skema Zod dan melempar ResponseError terstruktur. */
export function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ResponseError("VALIDATION_ERROR", undefined, mapZodIssues(parsed.error));
  }
  return parsed.data;
}
