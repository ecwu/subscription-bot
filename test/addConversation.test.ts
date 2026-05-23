import { describe, it, expect } from "vitest";
import {
  validateAddName,
  validateAddPrice,
  validateAddCurrency,
  validateAddDate,
  buildBillingDatePreview,
  dateKeyboard,
  formatBillingDatePreview,
  resolveAddCurrencyForPrice,
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
      expect(result.error).toBe("请输入非负数字，或点击按钮跳过。");
    });
    it("rejects non-numeric input", () => {
      const result = validateAddPrice("abc");
      expect(result.error).toBe("请输入非负数字，或点击按钮跳过。");
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

  describe("resolveAddCurrencyForPrice", () => {
    it("skips currency when price is skipped", () => {
      expect(resolveAddCurrencyForPrice(undefined, "CNY")).toEqual({
        currency: undefined,
        shouldAskCurrency: false,
      });
    });

    it("uses explicit default currency when price exists", () => {
      expect(resolveAddCurrencyForPrice(12.99, "CNY")).toEqual({
        currency: "CNY",
        shouldAskCurrency: false,
      });
    });

    it("asks for currency when price exists without explicit default", () => {
      expect(resolveAddCurrencyForPrice(12.99)).toEqual({
        currency: undefined,
        shouldAskCurrency: true,
      });
    });

    it("does not treat fallback USD as explicit unless passed in", () => {
      expect(resolveAddCurrencyForPrice(12.99, undefined)).toEqual({
        currency: undefined,
        shouldAskCurrency: true,
      });
    });
  });

  describe("validateAddDate", () => {
    it("accepts valid YYYY-MM-DD", () => {
      const result = validateAddDate("2026-06-01");
      expect(result.date).toBe("2026-06-01");
      expect(result.error).toBeUndefined();
    });
    it("rejects invalid format", () => {
      const result = validateAddDate("not a date");
      expect(result.error).toBeDefined();
    });
    it("rejects invalid date", () => {
      const result = validateAddDate("2026-13-01");
      expect(result.error).toBeDefined();
    });
    it("rejects impossible calendar dates", () => {
      const result = validateAddDate("2026-02-31");
      expect(result.error).toBeDefined();
    });
    it("accepts Chinese date format", () => {
      const result = validateAddDate("2026年6月1日");
      expect(result.date).toBe("2026-06-01");
      expect(result.error).toBeUndefined();
    });
    it("accepts slash format", () => {
      const result = validateAddDate("2026/06/01");
      expect(result.date).toBe("2026-06-01");
      expect(result.error).toBeUndefined();
    });
  });

  describe("dateKeyboard", () => {
    it("supports year and month navigation", () => {
      const keyboard = dateKeyboard("2026-05");
      expect(keyboard.inline_keyboard[0]).toEqual([
        { text: "« 上一年", callback_data: "adddate:month:2025-05" },
        { text: "‹ 上月", callback_data: "adddate:month:2026-04" },
        { text: "2026年5月", callback_data: "adddate:noop" },
        { text: "下月 ›", callback_data: "adddate:month:2026-06" },
        { text: "下一年 »", callback_data: "adddate:month:2027-05" },
      ]);
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

    it("previews interval dates", () => {
      expect(
        buildBillingDatePreview("2026-05-18", "interval", 18, 5, {
          unit: "day",
          count: 30,
        }),
      ).toEqual([
        "2026-05-18",
        "2026-06-17",
        "2026-07-17",
        "2026-08-16",
        "2026-09-15",
      ]);
    });
  });

  describe("formatBillingDatePreview", () => {
    it("formats the preview dates", () => {
      expect(formatBillingDatePreview("2026-05-18", "monthly")).toBe(
        [
          "周期：每月",
          "未来扣款日期预览：",
          "1. 2026-05-18",
          "2. 2026-06-18",
          "3. 2026-07-18",
          "4. 2026-08-18",
          "5. 2026-09-18",
        ].join("\n"),
      );
    });

    it("explains that custom cycles do not auto-advance", () => {
      expect(formatBillingDatePreview("2026-05-18", "custom")).toBe(
        [
          "周期：自定义",
          "未来扣款日期预览：",
          "1. 2026-05-18",
          "自定义周期不会自动推进，请之后手动修改下次扣款日期。",
        ].join("\n"),
      );
    });

    it("formats interval preview dates", () => {
      expect(
        formatBillingDatePreview("2026-05-18", "interval", {
          unit: "week",
          count: 4,
        }),
      ).toBe(
        [
          "周期：每 4 周",
          "未来扣款日期预览：",
          "1. 2026-05-18",
          "2. 2026-06-15",
          "3. 2026-07-13",
          "4. 2026-08-10",
          "5. 2026-09-07",
        ].join("\n"),
      );
    });

    it("formats month and year interval preview dates", () => {
      expect(
        formatBillingDatePreview("2026-05-18", "interval", {
          unit: "month",
          count: 6,
        }),
      ).toBe(
        [
          "周期：每 6 个月",
          "未来扣款日期预览：",
          "1. 2026-05-18",
          "2. 2026-11-18",
          "3. 2027-05-18",
          "4. 2027-11-18",
          "5. 2028-05-18",
        ].join("\n"),
      );

      expect(
        formatBillingDatePreview("2026-05-18", "interval", {
          unit: "year",
          count: 2,
        }),
      ).toBe(
        [
          "周期：每 2 年",
          "未来扣款日期预览：",
          "1. 2026-05-18",
          "2. 2028-05-18",
          "3. 2030-05-18",
          "4. 2032-05-18",
          "5. 2034-05-18",
        ].join("\n"),
      );
    });
  });
});
