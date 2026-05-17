import { describe, it, expect } from "vitest";
import { parseDeleteCallbackData } from "../src/utils/callbackParser.js";

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
