import type { Response } from "express";
import { StatusCodes } from "http-status-codes";
import type { PaginationMeta } from "../types/pagination.type.js";

export class ResponseHelper {
  /** Mengirim respons sukses 200 OK dengan amplop standar. */
  static ok<T>(res: Response, message: string, data: T) {
    return res.status(StatusCodes.OK).json({ success: true, message, data });
  }

  /** Mengirim respons sukses 201 Created dengan amplop standar. */
  static created<T>(res: Response, message: string, data: T) {
    return res.status(StatusCodes.CREATED).json({ success: true, message, data });
  }

  /** Mengirim respons sukses berpaginasi 200 OK beserta metadata halaman. */
  static paginated<T>(
    res: Response,
    message: string,
    data: T[],
    meta: PaginationMeta,
  ) {
    return res
      .status(StatusCodes.OK)
      .json({ success: true, message, data, meta });
  }
}
