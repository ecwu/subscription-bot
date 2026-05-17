import { describe, it, expect } from "vitest";
import {
  validateAddName,
  validateAddPrice,
  validateAddCurrency,
  validateAddDate,
} from "../src/bot/conversations/addConversation.js";

describe("addConversation validators", () => {
  describe("validateAddName", () => {
    it("accepts a valid name", () => {
      expect(validateAddName("Netflix")).toBeNull();
      expect(validateAddName("YouTube Premium")).toBeNull();
    });
    it("rejects empty names", () => {
      expect(validateAddName("")).toBe("Name cannot be empty.");
      expect(validateAddName("   ")).toBe("Name cannot be empty.");
    });
  });

  describe("validateAddPrice", () => {
    it("accepts skip", () => {
      const result = validateAddPrice("skip");
      expect(result.price).toBeUndefined();
      expect(result.error).toBeUndefined();
    });
    it("accepts valid numbers", () => {
      const result = validateAddPrice("12.99");
      expect(result.price).toBe(12.99);
      expect(result.error).toBeUndefined();
    });
    it("accepts zero", () => {
      const result = validateAddPrice("0");
      expect(result.price).toBe(0);
      expect(result.error).toBeUndefined();
    });
    it("rejects negative numbers", () => {
      const result = validateAddPrice("-1");
      expect(result.error).toBe("Enter a non-negative number, or type skip.");
    });
    it("rejects non-numeric input", () => {
      const result = validateAddPrice("abc");
      expect(result.error).toBe("Enter a non-negative number, or type skip.");
    });
  });

  describe("validateAddCurrency", () => {
    it("accepts skip when no price", () => {
      const result = validateAddCurrency("skip", false);
      expect(result.currency).toBeUndefined();
      expect(result.error).toBeUndefined();
    });
    it("requires currency when price exists", () => {
      const result = validateAddCurrency("skip", true);
      expect(result.error).toBe(
        "Currency is required when a price is set."
      );
    });
    it("accepts valid 3-letter codes", () => {
      const result = validateAddCurrency("EUR", true);
      expect(result.currency).toBe("EUR");
      expect(result.error).toBeUndefined();
    });
    it("rejects invalid codes", () => {
      const result = validateAddCurrency("EURO", true);
      expect(result.error).toBe(
        "Use a 3-letter currency code such as EUR or USD."
      );
    });
  });

  describe("validateAddDate", () => {
    it("accepts valid YYYY-MM-DD", () => {
      const result = validateAddDate("2026-06-01");
      expect(result.date).toBe("2026-06-01");
      expect(result.error).toBeUndefined();
    });
    it("rejects invalid format", () => {
      const result = validateAddDate("01-06-2026");
      expect(result.error).toBe("Use YYYY-MM-DD, for example 2026-06-01.");
    });
    it("rejects invalid date", () => {
      const result = validateAddDate("2026-13-01");
      expect(result.error).toBe(
        "Invalid date. Use YYYY-MM-DD, for example 2026-06-01."
      );
    });
  });
});
