import { describe, it, expect } from "vitest";
import { parseEditArgs } from "../src/utils/editParser.js";
import { ValidationError } from "../src/utils/errors.js";

describe("parseEditArgs", () => {
  it("parses date edit", () => {
    const args = ["/edit", "a1b2c3d4", "date", "2026-07-01"];
    const result = parseEditArgs(args);
    expect(result.subId).toBe("a1b2c3d4");
    expect(result.field).toBe("date");
    expect(result.nextBillingDate).toBe("2026-07-01");
  });

  it("parses price edit", () => {
    const args = ["/edit", "a1b2c3d4", "price", "15.99", "USD"];
    const result = parseEditArgs(args);
    expect(result.subId).toBe("a1b2c3d4");
    expect(result.field).toBe("price");
    expect(result.price).toBe(15.99);
    expect(result.currency).toBe("USD");
  });

  it("normalizes currency to uppercase", () => {
    const args = ["/edit", "a1b2c3d4", "price", "10", "eur"];
    const result = parseEditArgs(args);
    expect(result.currency).toBe("EUR");
  });

  it("parses cycle edit", () => {
    const args = ["/edit", "a1b2c3d4", "cycle", "yearly"];
    const result = parseEditArgs(args);
    expect(result.subId).toBe("a1b2c3d4");
    expect(result.field).toBe("cycle");
    expect(result.billingCycle).toBe("yearly");
  });

  it("accepts all valid cycles", () => {
    const cycles = [
      "weekly",
      "monthly",
      "quarterly",
      "yearly",
      "custom",
    ] as const;
    for (const cycle of cycles) {
      const args = ["/edit", "id", "cycle", cycle];
      const result = parseEditArgs(args);
      expect(result.billingCycle).toBe(cycle);
    }
  });

  it("throws for too few arguments", () => {
    const args = ["/edit", "a1b2c3d4"];
    expect(() => parseEditArgs(args)).toThrow(ValidationError);
    expect(() => parseEditArgs(args)).toThrow(/用法/);
  });

  it("throws for missing subId", () => {
    const args = ["/edit", "", "date", "2026-07-01"];
    expect(() => parseEditArgs(args)).toThrow(ValidationError);
    expect(() => parseEditArgs(args)).toThrow(/ID/);
  });

  it("throws for invalid date", () => {
    const args = ["/edit", "a1b2c3d4", "date", "07-01-2026"];
    expect(() => parseEditArgs(args)).toThrow(ValidationError);
    expect(() => parseEditArgs(args)).toThrow(/日期/);
  });

  it("throws for invalid date values", () => {
    const args = ["/edit", "a1b2c3d4", "date", "2026-13-01"];
    expect(() => parseEditArgs(args)).toThrow(ValidationError);
    expect(() => parseEditArgs(args)).toThrow(/日期/);
  });

  it("throws for impossible calendar dates", () => {
    const args = ["/edit", "a1b2c3d4", "date", "2026-02-31"];
    expect(() => parseEditArgs(args)).toThrow(ValidationError);
    expect(() => parseEditArgs(args)).toThrow(/日期/);
  });

  it("throws for price edit missing currency", () => {
    const args = ["/edit", "a1b2c3d4", "price", "15.99"];
    expect(() => parseEditArgs(args)).toThrow(ValidationError);
    expect(() => parseEditArgs(args)).toThrow(/用法/);
  });

  it("throws for invalid price", () => {
    const args = ["/edit", "a1b2c3d4", "price", "abc", "USD"];
    expect(() => parseEditArgs(args)).toThrow(ValidationError);
    expect(() => parseEditArgs(args)).toThrow(/价格/);
  });

  it("throws for negative price", () => {
    const args = ["/edit", "a1b2c3d4", "price", "-5", "USD"];
    expect(() => parseEditArgs(args)).toThrow(ValidationError);
    expect(() => parseEditArgs(args)).toThrow(/价格/);
  });

  it("throws for invalid cycle", () => {
    const args = ["/edit", "a1b2c3d4", "cycle", "daily"];
    expect(() => parseEditArgs(args)).toThrow(ValidationError);
    expect(() => parseEditArgs(args)).toThrow(/周期/);
  });

  it("throws for unknown field", () => {
    const args = ["/edit", "a1b2c3d4", "name", "New Name"];
    expect(() => parseEditArgs(args)).toThrow(ValidationError);
    expect(() => parseEditArgs(args)).toThrow(/未知字段/);
  });
});
