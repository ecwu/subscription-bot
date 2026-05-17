import { z } from "zod";
import type { BillingCycle } from "../models/subscription.js";

export const billingCycleSchema = z.enum([
  "monthly",
  "yearly",
  "quarterly",
  "weekly",
  "custom",
]) satisfies z.ZodType<BillingCycle>;

export const subscriptionInputSchema = z.object({
  name: z.string().min(1).max(100),
  price: z.number().nonnegative().optional(),
  currency: z.string().min(1).max(3).optional(),
  billingCycle: billingCycleSchema,
  nextBillingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.string().max(50).optional(),
  note: z.string().max(500).optional(),
});

export type SubscriptionInput = z.infer<typeof subscriptionInputSchema>;
