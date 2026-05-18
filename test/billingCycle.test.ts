import { describe, it, expect } from "vitest";
import {
  formatBillingCycleValue,
  parseBillingCycleText,
} from "../src/utils/billingCycle.js";
import { ValidationError } from "../src/utils/errors.js";

describe("billing cycle parsing", () => {
  it("parses day and week interval formats", () => {
    expect(parseBillingCycleText("every 30 days")).toEqual({
      billingCycle: "interval",
      billingInterval: { unit: "day", count: 30 },
    });
    expect(parseBillingCycleText("every 4 weeks")).toEqual({
      billingCycle: "interval",
      billingInterval: { unit: "week", count: 4 },
    });
    expect(parseBillingCycleText("30d")).toEqual({
      billingCycle: "interval",
      billingInterval: { unit: "day", count: 30 },
    });
    expect(parseBillingCycleText("4w")).toEqual({
      billingCycle: "interval",
      billingInterval: { unit: "week", count: 4 },
    });
    expect(parseBillingCycleText("每30天")).toEqual({
      billingCycle: "interval",
      billingInterval: { unit: "day", count: 30 },
    });
    expect(parseBillingCycleText("每4周")).toEqual({
      billingCycle: "interval",
      billingInterval: { unit: "week", count: 4 },
    });
  });

  it("rejects invalid interval values and unsupported units", () => {
    expect(() => parseBillingCycleText("0d")).toThrow(ValidationError);
    expect(() => parseBillingCycleText("367d")).toThrow(ValidationError);
    expect(() => parseBillingCycleText("53w")).toThrow(ValidationError);
    expect(() => parseBillingCycleText("-1d")).toThrow(ValidationError);
    expect(() => parseBillingCycleText("every 2 months")).toThrow(
      ValidationError,
    );
  });

  it("formats interval labels", () => {
    expect(formatBillingCycleValue("interval", { unit: "day", count: 30 })).toBe(
      "每 30 天",
    );
    expect(formatBillingCycleValue("interval", { unit: "week", count: 4 })).toBe(
      "每 4 周",
    );
  });
});
