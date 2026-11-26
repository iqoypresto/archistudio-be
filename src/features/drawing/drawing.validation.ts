import { z } from "zod";

export class DrawingValidation {
  static readonly PARAMS = {
    projectId: z.object({
      projectId: z.string().min(1, "ID project wajib disertakan."),
    }),
    drawingId: z.object({
      id: z.string().min(1, "ID Drawing wajib disertakan."),
    }),
  };

  static readonly QUERY = {
    list: z.object({
      includeArchived: z
        .enum(["true", "false"])
        .optional()
        .transform((val) => val === "true"),
    }),
  };

  static readonly BODY = {
    create: z.object({
      storedFileId: z.string().uuid("ID file Drawing tidak valid."),
    }),
  };
}
