import type { PayeeType, PaymentStatus } from "@prisma/client";
import type { z } from "zod";
import type { PaymentValidation } from "./payment.validation.js";

export type GetPaymentPeopleQuery = z.infer<typeof PaymentValidation.QUERY.getPeople>;
export type GetPaymentRecordsQuery = z.infer<typeof PaymentValidation.QUERY.getRecords>;
export type CreatePayeeDTO = z.infer<typeof PaymentValidation.BODY.createPerson>;
export type CreatePaymentRecordDTO = z.infer<typeof PaymentValidation.BODY.createRecord>;
export type UpdatePaymentRecordDTO = z.infer<typeof PaymentValidation.BODY.updateRecord>;

export interface PaymentProofInput {
  storedFileId: string;
}

export interface PaymentPayeeItem {
  id: string;
  type: PayeeType;
  name: string;
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
  summary: {
    recordCount: number;
    paidCount: number;
    unpaidCount: number;
    totalPaid: number;
    totalUnpaid: number;
    latestRecordDate: string | null;
  };
}

export interface PaymentRecordItem {
  id: string;
  payeeId: string;
  status: PaymentStatus;
  amount: number;
  recordDate: string;
  dueDate: string | null;
  proofStoredFileId: string | null;
  proofFileName: string | null;
  proofMimeType: string | null;
  proofSizeBytes: number | null;
  proofContentPath: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}
