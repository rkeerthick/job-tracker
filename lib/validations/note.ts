import { z } from "zod";

export const createNoteSchema = z.object({
  body: z
    .string({ error: "Note is required" })
    .trim()
    .min(1, "Note is required")
    .max(2000, "Note must be at most 2000 characters"),
});
