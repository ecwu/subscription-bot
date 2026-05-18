import { describe, it, expect } from "vitest";
import {
  parseDeleteCallbackData,
  parseSubCallbackData,
} from "../src/utils/callbackParser.js";

describe("parseDeleteCallbackData", () => {
  it("parses confirm callback", () => {
    const result = parseDeleteCallbackData("delete:confirm:abc-123");
    expect(result).toEqual({ action: "confirm", subId: "abc-123" });
  });

  it("parses cancel callback", () => {
    const result = parseDeleteCallbackData("delete:cancel:xyz-789");
    expect(result).toEqual({ action: "cancel", subId: "xyz-789" });
  });

  it("parses subId with colons", () => {
    const result = parseDeleteCallbackData("delete:confirm:abc:def");
    expect(result).toEqual({ action: "confirm", subId: "abc:def" });
  });

  it("returns null for wrong prefix", () => {
    const result = parseDeleteCallbackData("other:confirm:abc");
    expect(result).toBeNull();
  });

  it("returns null for missing subId", () => {
    const result = parseDeleteCallbackData("delete:confirm:");
    expect(result).toBeNull();
  });

  it("returns null for invalid action", () => {
    const result = parseDeleteCallbackData("delete:other:abc");
    expect(result).toBeNull();
  });

  it("returns null for empty string", () => {
    const result = parseDeleteCallbackData("");
    expect(result).toBeNull();
  });
});

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

  it("parses pause callback", () => {
    const result = parseSubCallbackData("sub:pause:abc-123");
    expect(result).toEqual({ action: "pause", subId: "abc-123" });
  });

  it("parses resume callback", () => {
    const result = parseSubCallbackData("sub:resume:abc-123");
    expect(result).toEqual({ action: "resume", subId: "abc-123" });
  });

  it("parses subId with colons", () => {
    const result = parseSubCallbackData("sub:view:abc:def");
    expect(result).toEqual({ action: "view", subId: "abc:def" });
  });

  it("returns null for wrong prefix", () => {
    const result = parseSubCallbackData("other:view:abc");
    expect(result).toBeNull();
  });

  it("returns null for missing subId", () => {
    const result = parseSubCallbackData("sub:view:");
    expect(result).toBeNull();
  });

  it("returns null for invalid action", () => {
    const result = parseSubCallbackData("sub:other:abc");
    expect(result).toBeNull();
  });

  it("returns null for empty string", () => {
    const result = parseSubCallbackData("");
    expect(result).toBeNull();
  });
});
