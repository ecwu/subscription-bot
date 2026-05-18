import { describe, expect, it } from "vitest";
import type { Subscription } from "../src/models/subscription.js";
import {
  formatRelativeBillingDate,
  formatSubscriptionFullLine,
  formatSubscriptionLine,
} from "../src/utils/formatSubscription.js";

function createSubscription(
  overrides: Partial<Subscription> = {},
): Subscription {
  return {
    id: "12345678-1234-1234-1234-123456789abc",
    name: "Netflix",
    price: 12.99,
    currency: "USD",
    billingCycle: "monthly",
    nextBillingDate: "2026-06-01",
    status: "active",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("formatSubscription", () => {
  it("formats compact list lines with relative billing date", () => {
    const line = formatSubscriptionLine(createSubscription(), 0, "2026-05-18");

    expect(line).toBe("1. Netflix — 12.99 USD — 下次扣款：14 天后");
  });

  it("omits missing prices from compact list lines", () => {
    const line = formatSubscriptionLine(
      createSubscription({ price: undefined, currency: undefined }),
      1,
      "2026-05-18",
    );

    expect(line).toBe("2. Netflix — 下次扣款：14 天后");
  });

  it("formats relative billing dates for today and past dates", () => {
    expect(formatRelativeBillingDate("2026-05-18", "2026-05-18")).toBe("今天");
    expect(formatRelativeBillingDate("2026-05-17", "2026-05-18")).toBe(
      "已过期 1 天",
    );
  });

  it("keeps full list lines compatible with action button messages", () => {
    const line = formatSubscriptionFullLine(
      createSubscription({ billingCycle: "yearly" }),
      0,
    );

    expect(line).toBe(
      "1. Netflix — 12.99 USD — 每年 — 下次扣款：2026-06-01 — ID：12345678",
    );
  });

  it("shows paused label in compact list line", () => {
    const line = formatSubscriptionLine(
      createSubscription({ status: "paused" }),
      0,
      "2026-05-18",
    );

    expect(line).toBe("1. [已暂停] Netflix — 12.99 USD — 下次扣款：14 天后");
  });

  it("shows paused label in full list line", () => {
    const line = formatSubscriptionFullLine(
      createSubscription({ status: "paused" }),
      0,
    );

    expect(line).toBe(
      "1. [已暂停] Netflix — 12.99 USD — 每月 — 下次扣款：2026-06-01 — ID：12345678",
    );
  });

  it("does not show label for active subscriptions", () => {
    const line = formatSubscriptionLine(
      createSubscription({ status: "active" }),
      0,
      "2026-05-18",
    );

    expect(line).toBe("1. Netflix — 12.99 USD — 下次扣款：14 天后");
  });
});