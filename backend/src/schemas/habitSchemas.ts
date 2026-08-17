import { z } from "zod";
import { isIsoDate } from "../utils/dates.js";

export const createHabitSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  unit: z.string().trim().min(1).max(32).default("times"),
  target: z.number().positive("Target must be greater than zero.").default(1),
});

export const logHabitSchema = z.object({
  habitId: z.number().int().positive(),
  value: z.number().nonnegative().optional(),
  date: z.string().refine(isIsoDate, "Expected a YYYY-MM-DD date.").optional(),
});

export type CreateHabitBody = z.infer<typeof createHabitSchema>;
export type LogHabitBody = z.infer<typeof logHabitSchema>;
