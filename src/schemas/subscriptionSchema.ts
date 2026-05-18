import { z } from "zod";
import type { BillingCycle, BillingInterval } from "../models/subscription.js";

export const billingCycleSchema = z.enum([
  "monthly",
  "yearly",
  "quarterly",
  "weekly",
  "custom",
  "interval",
]) satisfies z.ZodType<BillingCycle>;

export const billingIntervalSchema = z.discriminatedUnion("unit", [
  z.object({
    unit: z.literal("day"),
    count: z.number().int().min(1).max(366),
  }),
  z.object({
    unit: z.literal("week"),
    count: z.number().int().min(1).max(52),
  }),
]) satisfies z.ZodType<BillingInterval>;

export const subscriptionInputSchema = z
  .object({
    name: z.string().min(1).max(100),
    price: z.number().nonnegative().optional(),
    currency: z.string().min(1).max(3).optional(),
    billingCycle: billingCycleSchema,
    billingInterval: billingIntervalSchema.optional(),
    nextBillingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    billingAnchorDay: z.number().int().min(1).max(31).optional(),
    category: z.string().max(50).optional(),
    note: z.string().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.billingCycle === "interval" && !value.billingInterval) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["billingInterval"],
        message: "Interval billing cycle requires billingInterval.",
      });
    }
  });

export type SubscriptionInput = z.infer<typeof subscriptionInputSchema>;
