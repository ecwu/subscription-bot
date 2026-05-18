import { describe, it, expect } from "vitest";
import {
  validateAddName,
  validateAddPrice,
  validateAddCurrency,
  validateAddDate,
  buildBillingDatePreview,
  formatBillingDatePreview,
} from "../src/bot/conversations/addConversation.js";

describe("addConversation validators", () => {
  describe("validateAddName", () => {
    it("accepts a valid name", () => {
      expect(validateAddName("Netflix")).toBeNull();
      expect(validateAddName("YouTube Premium")).toBeNull();
    });
    it("rejects empty names", () => {
      expect(validateAddName("")).toBe("订阅名称不能为空。");
      expect(validateAddName("   ")).toBe("订阅名称不能为空。");
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
      expect(result.error).toBe("请输入非负数字，或发送 skip 跳过。");
    });
    it("rejects non-numeric input", () => {
      const result = validateAddPrice("abc");
      expect(result.error).toBe("请输入非负数字，或发送 skip 跳过。");
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
      expect(result.error).toBe("已填写价格时必须选择币种。");
    });
    it("accepts valid 3-letter codes", () => {
      const result = validateAddCurrency("EUR", true);
      expect(result.currency).toBe("EUR");
      expect(result.error).toBeUndefined();
    });
    it("rejects invalid codes", () => {
      const result = validateAddCurrency("EURO", true);
      expect(result.error).toBe("请输入 3 位币种代码，例如 CNY 或 USD。");
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
      expect(result.error).toBe("请使用 YYYY-MM-DD 格式，例如 2026-06-01。");
    });
    it("rejects invalid date", () => {
      const result = validateAddDate("2026-13-01");
      expect(result.error).toBe(
        "日期无效。请使用 YYYY-MM-DD 格式，例如 2026-06-01。",
      );
    });
    it("rejects impossible calendar dates", () => {
      const result = validateAddDate("2026-02-31");
      expect(result.error).toBe(
        "日期无效。请使用 YYYY-MM-DD 格式，例如 2026-06-01。",
      );
    });
  });

  describe("buildBillingDatePreview", () => {
    it("previews five monthly dates", () => {
      expect(buildBillingDatePreview("2026-05-18", "monthly")).toEqual([
        "2026-05-18",
        "2026-06-18",
        "2026-07-18",
        "2026-08-18",
        "2026-09-18",
      ]);
    });

    it("keeps the original anchor day across short months", () => {
      expect(buildBillingDatePreview("2026-01-31", "monthly")).toEqual([
        "2026-01-31",
        "2026-02-28",
        "2026-03-31",
        "2026-04-30",
        "2026-05-31",
      ]);
    });

    it("returns to leap day for yearly previews when possible", () => {
      expect(buildBillingDatePreview("2024-02-29", "yearly", 29, 6)).toEqual([
        "2024-02-29",
        "2025-02-28",
        "2026-02-28",
        "2027-02-28",
        "2028-02-29",
        "2029-02-28",
      ]);
    });

    it("does not auto-advance custom cycles", () => {
      expect(buildBillingDatePreview("2026-05-18", "custom")).toEqual([
        "2026-05-18",
      ]);
    });
  });

  describe("formatBillingDatePreview", () => {
    it("formats the preview dates", () => {
      expect(formatBillingDatePreview("2026-05-18", "monthly")).toBe(
        [
          "未来扣款日期预览：",
          "1. 2026-05-18",
          "2. 2026-06-18",
          "3. 2026-07-18",
          "4. 2026-08-18",
          "5. 2026-09-18",
          "这个更新时间安排是否正确？",
        ].join("\n"),
      );
    });

    it("explains that custom cycles do not auto-advance", () => {
      expect(formatBillingDatePreview("2026-05-18", "custom")).toBe(
        [
          "未来扣款日期预览：",
          "1. 2026-05-18",
          "自定义周期不会自动推进，请之后手动修改下次扣款日期。",
          "这个更新时间安排是否正确？",
        ].join("\n"),
      );
    });
  });
});
