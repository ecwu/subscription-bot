import { describe, it, expect } from "vitest";
import {
  parseSubCallbackData,
  parseEditCallbackData,
  parseCycleCallbackData,
  parseAddConfirmCallbackData,
  parseAddCurrencyCallbackData,
  parseAddDateCallbackData,
  parseEditCycleCallbackData,
} from "../src/utils/callbackParser.js";

describe("parseSubCallbackData", () => {
  it("parses view callback", () => {
    const result = parseSubCallbackData("sub:view:abc-123");
    expect(result).toEqual({ action: "view", subId: "abc-123" });
  });
  it("parses edit callback", () => {
    const result = parseSubCallbackData("sub:edit:abc-123");
    expect(result).toEqual({ action: "edit", subId: "abc-123" });
  });
  it("parses delete callback", () => {
    const result = parseSubCallbackData("sub:delete:abc-123");
    expect(result).toEqual({ action: "delete", subId: "abc-123" });
  });
  it("handles subId with colons", () => {
    const result = parseSubCallbackData("sub:view:abc:123:xyz");
    expect(result).toEqual({ action: "view", subId: "abc:123:xyz" });
  });
  it("returns null for invalid prefix", () => {
    expect(parseSubCallbackData("edit:view:abc")).toBeNull();
  });
  it("returns null for missing subId", () => {
    expect(parseSubCallbackData("sub:view")).toBeNull();
  });
  it("returns null for unknown action", () => {
    expect(parseSubCallbackData("sub:unknown:abc")).toBeNull();
  });
});

describe("parseEditCallbackData", () => {
  it("parses name edit", () => {
    const result = parseEditCallbackData("edit:name:abc-123");
    expect(result).toEqual({ field: "name", subId: "abc-123" });
  });
  it("parses price edit", () => {
    const result = parseEditCallbackData("edit:price:abc-123");
    expect(result).toEqual({ field: "price", subId: "abc-123" });
  });
  it("parses currency edit", () => {
    const result = parseEditCallbackData("edit:currency:abc-123");
    expect(result).toEqual({ field: "currency", subId: "abc-123" });
  });
  it("parses cycle edit", () => {
    const result = parseEditCallbackData("edit:cycle:abc-123");
    expect(result).toEqual({ field: "cycle", subId: "abc-123" });
  });
  it("parses date edit", () => {
    const result = parseEditCallbackData("edit:date:abc-123");
    expect(result).toEqual({ field: "date", subId: "abc-123" });
  });
  it("parses cancel", () => {
    const result = parseEditCallbackData("edit:cancel:abc-123");
    expect(result).toEqual({ field: "cancel", subId: "abc-123" });
  });
  it("handles subId with colons", () => {
    const result = parseEditCallbackData("edit:price:abc:123");
    expect(result).toEqual({ field: "price", subId: "abc:123" });
  });
  it("returns null for invalid prefix", () => {
    expect(parseEditCallbackData("sub:name:abc")).toBeNull();
  });
  it("returns null for missing subId", () => {
    expect(parseEditCallbackData("edit:name")).toBeNull();
  });
});

describe("parseCycleCallbackData", () => {
  it("parses weekly cycle", () => {
    const result = parseCycleCallbackData("cycle:weekly");
    expect(result).toEqual({ cycle: "weekly" });
  });
  it("parses monthly cycle", () => {
    const result = parseCycleCallbackData("cycle:monthly");
    expect(result).toEqual({ cycle: "monthly" });
  });
  it("returns null for invalid prefix", () => {
    expect(parseCycleCallbackData("edit:weekly")).toBeNull();
  });
  it("returns null for empty cycle", () => {
    expect(parseCycleCallbackData("cycle:")).toBeNull();
  });
});

describe("parseAddConfirmCallbackData", () => {
  it("parses confirm", () => {
    const result = parseAddConfirmCallbackData("add:confirm");
    expect(result).toEqual({ action: "confirm" });
  });
  it("parses cancel", () => {
    const result = parseAddConfirmCallbackData("add:cancel");
    expect(result).toEqual({ action: "cancel" });
  });
  it("returns null for unknown action", () => {
    expect(parseAddConfirmCallbackData("add:other")).toBeNull();
  });
  it("returns null for invalid prefix", () => {
    expect(parseAddConfirmCallbackData("delete:confirm")).toBeNull();
  });
});

describe("parseAddCurrencyCallbackData", () => {
  it("parses selected currency", () => {
    const result = parseAddCurrencyCallbackData("addcurrency:CNY");
    expect(result).toEqual({ action: "select", currency: "CNY" });
  });
  it("parses skip", () => {
    const result = parseAddCurrencyCallbackData("addcurrency:skip");
    expect(result).toEqual({ action: "skip" });
  });
  it("parses other", () => {
    const result = parseAddCurrencyCallbackData("addcurrency:other");
    expect(result).toEqual({ action: "other" });
  });
  it("parses cancel", () => {
    const result = parseAddCurrencyCallbackData("addcurrency:cancel");
    expect(result).toEqual({ action: "cancel" });
  });
  it("returns null for invalid currency", () => {
    expect(parseAddCurrencyCallbackData("addcurrency:CN")).toBeNull();
  });
});

describe("parseAddDateCallbackData", () => {
  it("parses picked date", () => {
    const result = parseAddDateCallbackData("adddate:pick:2026-06-01");
    expect(result).toEqual({ action: "pick", date: "2026-06-01" });
  });
  it("parses month navigation", () => {
    const result = parseAddDateCallbackData("adddate:month:2026-06");
    expect(result).toEqual({ action: "month", month: "2026-06" });
  });
  it("parses noop", () => {
    const result = parseAddDateCallbackData("adddate:noop");
    expect(result).toEqual({ action: "noop" });
  });
  it("parses cancel", () => {
    const result = parseAddDateCallbackData("adddate:cancel");
    expect(result).toEqual({ action: "cancel" });
  });
  it("returns null for malformed date", () => {
    expect(parseAddDateCallbackData("adddate:pick:2026-6-1")).toBeNull();
  });
});

describe("parseEditCycleCallbackData", () => {
  it("parses edit cycle", () => {
    const result = parseEditCycleCallbackData("editcycle:monthly:abc-123");
    expect(result).toEqual({ cycle: "monthly", subId: "abc-123" });
  });
  it("handles subId with colons", () => {
    const result = parseEditCycleCallbackData("editcycle:yearly:abc:123");
    expect(result).toEqual({ cycle: "yearly", subId: "abc:123" });
  });
  it("returns null for invalid prefix", () => {
    expect(parseEditCycleCallbackData("cycle:monthly:abc")).toBeNull();
  });
  it("returns null for missing cycle", () => {
    expect(parseEditCycleCallbackData("editcycle::abc")).toBeNull();
  });
  it("returns null for missing subId", () => {
    expect(parseEditCycleCallbackData("editcycle:monthly")).toBeNull();
  });
});
