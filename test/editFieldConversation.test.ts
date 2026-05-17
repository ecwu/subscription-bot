import { describe, it, expect } from "vitest";
import {
  validateEditName,
  validateEditPrice,
  validateEditCurrency,
  validateEditDate,
} from "../src/bot/conversations/editFieldConversation.js";

describe("editFieldConversation validators", () => {
  describe("validateEditName", () => {
    it("accepts a valid name", () => {
      expect(validateEditName("Netflix")).toBeNull();
    });
    it("rejects empty names", () => {
      expect(validateEditName("")).toBe("Name cannot be empty.");
      expect(validateEditName("   ")).toBe("Name cannot be empty.");
    });
  });

  describe("validateEditPrice", () => {
    it("accepts valid numbers", () => {
      const result = validateEditPrice("12.99");
      expect(result.price).toBe(12.99);
      expect(result.error).toBeUndefined();
    });
    it("accepts zero", () => {
      const result = validateEditPrice("0");
      expect(result.price).toBe(0);
      expect(result.error).toBeUndefined();
    });
    it("rejects negative numbers", () => {
      const result = validateEditPrice("-1");
      expect(result.error).toBe("Enter a non-negative number.");
    });
    it("rejects non-numeric input", () => {
      const result = validateEditPrice("abc");
      expect(result.error).toBe("Enter a non-negative number.");
    });
  });

  describe("validateEditCurrency", () => {
    it("accepts valid 3-letter codes", () => {
      const result = validateEditCurrency("EUR");
      expect(result.currency).toBe("EUR");
      expect(result.error).toBeUndefined();
    });
    it("rejects invalid codes", () => {
      const result = validateEditCurrency("EURO");
      expect(result.error).toBe(
        "Use a 3-letter currency code such as EUR or USD."
      );
    });
    it("converts to uppercase", () => {
      const result = validateEditCurrency("eur");
      expect(result.currency).toBe("EUR");
    });
  });

  describe("validateEditDate", () => {
    it("accepts valid YYYY-MM-DD", () => {
      const result = validateEditDate("2026-06-01");
      expect(result.date).toBe("2026-06-01");
      expect(result.error).toBeUndefined();
    });
    it("rejects invalid format", () => {
      const result = validateEditDate("01-06-2026");
      expect(result.error).toBe("Use YYYY-MM-DD, for example 2026-06-01.");
    });
    it("rejects invalid date", () => {
      const result = validateEditDate("2026-13-01");
      expect(result.error).toBe(
        "Invalid date. Use YYYY-MM-DD, for example 2026-06-01."
      );
    });
  });
});
