import { describe, it, expect } from "vitest";
import { parseAddArgs } from "../src/utils/commandParser.js";
import { ValidationError } from "../src/utils/errors.js";

describe("parseAddArgs", () => {
  it("parses valid arguments", () => {
    const args = ["/add", "Netflix", "12.99", "EUR", "monthly", "2026-06-01"];
    const result = parseAddArgs(args);

    expect(result.name).toBe("Netflix");
    expect(result.price).toBe(12.99);
    expect(result.currency).toBe("EUR");
    expect(result.billingCycle).toBe("monthly");
    expect(result.nextBillingDate).toBe("2026-06-01");
  });

  it("normalizes currency to uppercase", () => {
    const args = ["/add", "Spotify", "9.99", "usd", "monthly", "2026-06-01"];
    const result = parseAddArgs(args);
    expect(result.currency).toBe("USD");
  });

  it("accepts all valid billing cycles", () => {
    const cycles = [
      "weekly",
      "monthly",
      "quarterly",
      "yearly",
      "custom",
    ] as const;
    for (const cycle of cycles) {
      const args = ["/add", "Test", "1", "EUR", cycle, "2026-06-01"];
      const result = parseAddArgs(args);
      expect(result.billingCycle).toBe(cycle);
    }
  });

  it("parses interval billing cycle formats", () => {
    const verbose = parseAddArgs([
      "/add",
      "Test",
      "1",
      "EUR",
      "every",
      "30",
      "days",
      "2026-06-01",
    ]);
    expect(verbose.billingCycle).toBe("interval");
    expect(verbose.billingInterval).toEqual({ unit: "day", count: 30 });

    const compact = parseAddArgs([
      "/add",
      "Test",
      "1",
      "EUR",
      "4w",
      "2026-06-01",
    ]);
    expect(compact.billingCycle).toBe("interval");
    expect(compact.billingInterval).toEqual({ unit: "week", count: 4 });
  });

  it("accepts zero price", () => {
    const args = ["/add", "Freebie", "0", "EUR", "monthly", "2026-06-01"];
    const result = parseAddArgs(args);
    expect(result.price).toBe(0);
  });

  it("accepts integer price", () => {
    const args = ["/add", "Service", "10", "EUR", "monthly", "2026-06-01"];
    const result = parseAddArgs(args);
    expect(result.price).toBe(10);
  });

  it("throws for too few arguments", () => {
    const args = ["/add", "Netflix", "12.99"];
    expect(() => parseAddArgs(args)).toThrow(ValidationError);
    expect(() => parseAddArgs(args)).toThrow(/用法/);
  });

  it("throws for missing name", () => {
    const args = ["/add", "", "12.99", "EUR", "monthly", "2026-06-01"];
    expect(() => parseAddArgs(args)).toThrow(ValidationError);
    expect(() => parseAddArgs(args)).toThrow(/名称/);
  });

  it("throws for invalid price", () => {
    const args = ["/add", "Netflix", "abc", "EUR", "monthly", "2026-06-01"];
    expect(() => parseAddArgs(args)).toThrow(ValidationError);
    expect(() => parseAddArgs(args)).toThrow(/价格/);
  });

  it("throws for negative price", () => {
    const args = ["/add", "Netflix", "-5", "EUR", "monthly", "2026-06-01"];
    expect(() => parseAddArgs(args)).toThrow(ValidationError);
    expect(() => parseAddArgs(args)).toThrow(/价格/);
  });

  it("throws for invalid cycle", () => {
    const args = ["/add", "Netflix", "12.99", "EUR", "daily", "2026-06-01"];
    expect(() => parseAddArgs(args)).toThrow(ValidationError);
    expect(() => parseAddArgs(args)).toThrow(/周期/);
  });

  it("throws for invalid date format", () => {
    const args = ["/add", "Netflix", "12.99", "EUR", "monthly", "06-01-2026"];
    expect(() => parseAddArgs(args)).toThrow(ValidationError);
    expect(() => parseAddArgs(args)).toThrow(/日期/);
  });

  it("throws for invalid date values", () => {
    const args = ["/add", "Netflix", "12.99", "EUR", "monthly", "2026-13-01"];
    expect(() => parseAddArgs(args)).toThrow(ValidationError);
    expect(() => parseAddArgs(args)).toThrow(/日期/);
  });
});
