import { describe, it, expect } from "vitest";
import {
  parseSubCallbackData,
  parseEditCallbackData,
  parseCycleCallbackData,
  parseAddConfirmCallbackData,
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
