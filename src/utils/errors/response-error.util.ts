import { AppErrors, type AppErrorKey } from "./errors.js";

export type ValidationErrorFields = Record<string, string[]>;

/** Error domain terstruktur yang dipetakan ke katalog AppErrors. */
export class ResponseError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly fields?: ValidationErrorFields;

  constructor(
    errorKey: AppErrorKey,
    customMessage?: string,
    fields?: ValidationErrorFields,
  ) {
    const def = AppErrors[errorKey];
    super(customMessage ?? def.message);
    this.statusCode = def.status;
    this.code = def.code;
    if (fields !== undefined) {
      this.fields = fields;
    }
    Object.setPrototypeOf(this, ResponseError.prototype);
  }
}
