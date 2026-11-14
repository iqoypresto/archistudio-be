import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "../constants/pagination.constant.js";
import type { PaginationMeta } from "../types/pagination.type.js";

export class PaginationHelper {
  /** Menghitung nilai skip & take yang aman untuk query Prisma. */
  static getSkipTake(page = DEFAULT_PAGE, pageSize = DEFAULT_PAGE_SIZE) {
    const safePage = Math.max(1, Math.floor(page));
    const safeSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(pageSize)));
    return {
      page: safePage,
      pageSize: safeSize,
      skip: (safePage - 1) * safeSize,
      take: safeSize,
    };
  }

  /** Membentuk metadata paginasi standar untuk amplop respons API. */
  static buildMeta(
    page: number,
    pageSize: number,
    totalItems: number,
  ): PaginationMeta {
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    return {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }
}
