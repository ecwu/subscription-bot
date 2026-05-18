import { describe, expect, it } from "vitest";
import { subscriptionInputSchema } from "../src/schemas/subscriptionSchema.js";

describe("subscriptionInputSchema", () => {
  it("accepts trial and auto-renew flags", () => {
    const parsed = subscriptionInputSchema.parse({
      name: "Netflix",
      price: 12,
      currency: "USD",
      billingCycle: "monthly",
      nextBillingDate: "2026-06-01",
      status: "active",
      isTrial: true,
      autoRenew: false,
    });

    expect(parsed.isTrial).toBe(true);
    expect(parsed.autoRenew).toBe(false);
  });
});
