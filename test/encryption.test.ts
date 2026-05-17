import { describe, it, expect } from "vitest";
import {
  encrypt,
  decrypt,
  serializeEncryptedPayload,
  parseEncryptedPayload,
} from "../src/crypto/encryption.js";

// A valid base64url-encoded 32-byte master key
const VALID_KEY = Buffer.from(
  "0123456789abcdef0123456789abcdef"
).toString("base64url");

describe("encryption", () => {
  it("encrypts and decrypts plaintext", async () => {
    const plaintext = "Hello, subscription bot!";

    const encrypted = await encrypt(plaintext, VALID_KEY);
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.ciphertext).toBeDefined();

    const decrypted = await decrypt(encrypted, VALID_KEY);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertexts for same plaintext", async () => {
    const plaintext = "Hello, subscription bot!";

    const encrypted1 = await encrypt(plaintext, VALID_KEY);
    const encrypted2 = await encrypt(plaintext, VALID_KEY);

    expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
    expect(encrypted1.iv).not.toBe(encrypted2.iv);
  });

  it("serializes and parses encrypted payload", () => {
    const payload = { iv: "abc123", ciphertext: "def456" };
    const serialized = serializeEncryptedPayload(payload);
    expect(serialized).toBe("abc123.def456");

    const parsed = parseEncryptedPayload(serialized);
    expect(parsed).toEqual(payload);
  });

  it("throws on invalid serialized payload", () => {
    expect(() => parseEncryptedPayload("invalid")).toThrow();
    expect(() => parseEncryptedPayload("")).toThrow();
  });

  it("throws with an invalid key format", async () => {
    await expect(encrypt("test", "short-key")).rejects.toThrow();
    await expect(encrypt("test", "not-base64!!!")).rejects.toThrow();
  });
});
