import { z } from "zod";
import { isValidTimezone } from "../models/userSettings.js";

export const userSettingsSchema = z.object({
  defaultCurrency: z
    .string()
    .min(3)
    .max(3)
    .regex(/^[A-Z]{3}$/, "Must be a 3-letter currency code"),
  reminderEnabled: z.boolean(),
  reminderHour: z.number().int().min(0).max(23),
  timezone: z
    .string()
    .refine(
      isValidTimezone,
      "Must be a valid IANA timezone or UTC offset (e.g., +8, -5, +5:30)",
    ),
});

export type UserSettingsInput = z.infer<typeof userSettingsSchema>;
