import type { PayeeType, PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "../../configs/prisma-client.config.js";
import {
  payeeWithPaymentsSelect,
  paymentRecordSelect,
  type RawPayeeRecord,
  type RawPaymentRecord,
} from "./payment.helper.js";

export class PaymentRepository {
  /** Mengambil daftar penerima pembayaran global (tanpa relasi project) (US-17, BR-36). */
  static async findPeople(params: {
    type?: PayeeType;
    search?: string;
  }): Promise<RawPayeeRecord[]> {
    const where: Prisma.ExternalPayeeWhereInput = {
      ...(params.type && { type: params.type }),
      ...(params.search && {
        OR: [
          { name: { contains: params.search, mode: "insensitive" } },
          { phone: { contains: params.search, mode: "insensitive" } },
        ],
      }),
    };

    return prisma.externalPayee.findMany({
      where,
      select: payeeWithPaymentsSelect,
      orderBy: [{ name: "asc" }, { createdAt: "desc" }],
    });
  }

  /** Mencari satu penerima pembayaran berdasarkan ID. */
  static async findPersonById(personId: string): Promise<{ id: string; type: PayeeType } | null> {
    return prisma.externalPayee.findUnique({
      where: { id: personId },
      select: { id: true, type: true },
    });
  }

  /** Menambahkan penerima pembayaran Freelance/Agent baru (US-17, BR-36). */
  static async createPerson(data: {
    type: PayeeType;
    name: string;
    phone: string | null;
  }): Promise<RawPayeeRecord> {
    return prisma.externalPayee.create({
      data,
      select: payeeWithPaymentsSelect,
    });
  }

  /** Mengambil daftar catatan pembayaran untuk satu orang (US-17, BR-36). */
  static async findRecordsByPersonId(
    payeeId: string,
    status?: PaymentStatus,
  ): Promise<RawPaymentRecord[]> {
    return prisma.paymentRecord.findMany({
      where: {
        payeeId,
        ...(status && { status }),
      },
      select: paymentRecordSelect,
      orderBy: [{ recordDate: "desc" }, { createdAt: "desc" }],
    });
  }

  /** Mengambil satu catatan pembayaran berdasarkan ID. */
  static async findRecordById(id: string): Promise<RawPaymentRecord | null> {
    return prisma.paymentRecord.findUnique({
      where: { id },
      select: paymentRecordSelect,
    });
  }

  /** Membuat catatan pembayaran baru untuk penerima tertentu (US-17, BR-36). */
  static async createRecord(data: {
    payeeId: string;
    status: PaymentStatus;
    amount: number;
    recordDate: Date;
    dueDate: Date | null;
    proofStorageKey: string | null;
    proofFileName: string | null;
    proofMimeType: string | null;
    proofSizeBytes: number | null;
    createdById: string;
  }): Promise<RawPaymentRecord> {
    return prisma.paymentRecord.create({
      data,
      select: paymentRecordSelect,
    });
  }

  /** Memperbarui catatan pembayaran yang ada (US-17, BR-36). */
  static async updateRecord(
    id: string,
    data: Prisma.PaymentRecordUpdateInput,
  ): Promise<RawPaymentRecord> {
    return prisma.paymentRecord.update({
      where: { id },
      data,
      select: paymentRecordSelect,
    });
  }
}
