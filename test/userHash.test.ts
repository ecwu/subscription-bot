import { describe, it, expect } from "vitest";
import { hashUserId } from "../src/crypto/userHash.js";

describe("hashUserId", () => {
  it("produces deterministic output for same input", async () => {
    const secret = "my-test-secret";
    const hash1 = await hashUserId(123456789, secret);
    const hash2 = await hashUserId(123456789, secret);
    expect(hash1).toBe(hash2);
  });

  it("produces different output for different user ids", async () => {
    const secret = "my-test-secret";
    const hash1 = await hashUserId(123456789, secret);
    const hash2 = await hashUserId(987654321, secret);
    expect(hash1).not.toBe(hash2);
  });

  it("produces different output for different secrets", async () => {
    const hash1 = await hashUserId(123456789, "secret-a");
    const hash2 = await hashUserId(123456789, "secret-b");
    expect(hash1).not.toBe(hash2);
  });

  it("returns a base64url string", async () => {
    const hash = await hashUserId(123456789, "my-test-secret");
    expect(hash).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
