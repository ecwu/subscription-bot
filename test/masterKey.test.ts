import { describe, it, expect } from "vitest";
import { parseMasterKey } from "../src/crypto/masterKey.js";

describe("parseMasterKey", () => {
  it("accepts a valid base64url 32-byte key", () => {
    const key = Buffer.from("0123456789abcdef0123456789abcdef").toString(
      "base64url",
    );
    const decoded = parseMasterKey(key);
    expect(decoded.length).toBe(32);
  });

  it("accepts a random base64url 32-byte key", () => {
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    const key = Buffer.from(randomBytes).toString("base64url");
    const decoded = parseMasterKey(key);
    expect(decoded.length).toBe(32);
  });

  it("rejects a key that is too short", () => {
    const key = Buffer.from("short").toString("base64url");
    expect(() => parseMasterKey(key)).toThrow(/32 bytes/);
  });

  it("rejects a key that is too long", () => {
    const key = Buffer.from("a".repeat(64)).toString("base64url");
    expect(() => parseMasterKey(key)).toThrow(/32 bytes/);
  });

  it("rejects an invalid base64url string", () => {
    // Buffer.from with base64url is forgiving; it decodes partial data and
    // then parseMasterKey rejects it for being the wrong length.
    expect(() => parseMasterKey("not-valid-base64!!!")).toThrow(/32 bytes/);
  });
});
