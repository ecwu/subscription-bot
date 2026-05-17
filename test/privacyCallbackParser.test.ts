import { describe, it, expect } from "vitest";
import {
  parsePrivacyCallbackData,
} from "../src/utils/callbackParser.js";

describe("parsePrivacyCallbackData", () => {
  it("parses delete_confirm", () => {
    const result = parsePrivacyCallbackData("privacy:delete_confirm");
    expect(result).toEqual({ action: "delete_confirm" });
  });

  it("parses delete_cancel", () => {
    const result = parsePrivacyCallbackData("privacy:delete_cancel");
    expect(result).toEqual({ action: "delete_cancel" });
  });

  it("returns null for invalid prefix", () => {
    expect(parsePrivacyCallbackData("other:delete_confirm")).toBeNull();
  });

  it("returns null for unknown action", () => {
    expect(parsePrivacyCallbackData("privacy:unknown")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parsePrivacyCallbackData("")).toBeNull();
  });
});
