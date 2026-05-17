import { describe, it, expect } from "vitest";
import { createUserRepository } from "../src/repositories/userRepository.js";
import type { KVNamespace } from "@cloudflare/workers-types";

const VALID_KEY = Buffer.from(
  "0123456789abcdef0123456789abcdef"
).toString("base64url");

function createMockKV(): KVNamespace {
  const store = new Map<string, string>();

  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    list: async (options?: { prefix?: string; limit?: number; cursor?: string }) => {
      const prefix = options?.prefix ?? "";
      const keys = Array.from(store.keys())
        .filter((k) => k.startsWith(prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true, cursor: "" };
    },
  } as unknown as KVNamespace;
}

describe("userRepository", () => {
  it("upserts and retrieves an encrypted user profile", async () => {
    const kv = createMockKV();
    const repo = createUserRepository(kv);

    await repo.upsertUserProfile("user-1", 123456, VALID_KEY);

    const profile = await repo.getUserProfile("user-1", VALID_KEY);
    expect(profile).not.toBeNull();
    expect(profile?.chatId).toBe(123456);
    expect(typeof profile?.firstSeenAt).toBe("string");
    expect(typeof profile?.lastSeenAt).toBe("string");
  });

  it("preserves firstSeenAt and updates lastSeenAt on subsequent upserts", async () => {
    const kv = createMockKV();
    const repo = createUserRepository(kv);

    await repo.upsertUserProfile("user-1", 123456, VALID_KEY);
    const first = await repo.getUserProfile("user-1", VALID_KEY);

    // Wait a tiny bit so lastSeenAt changes
    await new Promise((r) => setTimeout(r, 10));

    await repo.upsertUserProfile("user-1", 123456, VALID_KEY);
    const second = await repo.getUserProfile("user-1", VALID_KEY);

    expect(first?.firstSeenAt).toBe(second?.firstSeenAt);
    expect(second?.lastSeenAt).not.toBe(first?.lastSeenAt);
  });

  it("deletes a user profile", async () => {
    const kv = createMockKV();
    const repo = createUserRepository(kv);

    await repo.upsertUserProfile("user-1", 123456, VALID_KEY);
    expect(await repo.getUserProfile("user-1", VALID_KEY)).not.toBeNull();

    await repo.deleteUserProfile("user-1");
    expect(await repo.getUserProfile("user-1", VALID_KEY)).toBeNull();
  });

  it("returns null for a missing profile", async () => {
    const kv = createMockKV();
    const repo = createUserRepository(kv);

    const profile = await repo.getUserProfile("missing-user", VALID_KEY);
    expect(profile).toBeNull();
  });

  it("stores chatId as a string when given a string", async () => {
    const kv = createMockKV();
    const repo = createUserRepository(kv);

    await repo.upsertUserProfile("user-1", "-1001234567890", VALID_KEY);

    const profile = await repo.getUserProfile("user-1", VALID_KEY);
    expect(profile?.chatId).toBe("-1001234567890");
  });
});
