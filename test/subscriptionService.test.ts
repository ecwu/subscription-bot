import { describe, it, expect } from "vitest";
import { createSubscriptionService } from "../src/services/subscriptionService.js";
import { createSubscriptionRepository } from "../src/repositories/subscriptionRepository.js";
import type { KVNamespace } from "@cloudflare/workers-types";

// A valid base64url-encoded 32-byte master key
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

describe("subscriptionService", () => {
  it("creates and lists a subscription", async () => {
    const kv = createMockKV();
    const repo = createSubscriptionRepository(kv);
    const service = createSubscriptionService(repo);

    const userKey = "user-key-123";
    const sub = {
      id: "sub-1",
      name: "Netflix",
      price: 12.99,
      currency: "EUR",
      billingCycle: "monthly" as const,
      nextBillingDate: "2026-06-01",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await service.create(userKey, sub, VALID_KEY);

    const list = await service.list(userKey, VALID_KEY);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Netflix");
    expect(list[0].price).toBe(12.99);
  });

  it("gets a single subscription", async () => {
    const kv = createMockKV();
    const repo = createSubscriptionRepository(kv);
    const service = createSubscriptionService(repo);

    const userKey = "user-key-123";
    const sub = {
      id: "sub-1",
      name: "Netflix",
      price: 12.99,
      currency: "EUR",
      billingCycle: "monthly" as const,
      nextBillingDate: "2026-06-01",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await service.create(userKey, sub, VALID_KEY);

    const retrieved = await service.get(userKey, "sub-1", VALID_KEY);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.name).toBe("Netflix");
  });

  it("returns null for non-existent subscription", async () => {
    const kv = createMockKV();
    const repo = createSubscriptionRepository(kv);
    const service = createSubscriptionService(repo);

    const retrieved = await service.get("user-key", "missing", VALID_KEY);
    expect(retrieved).toBeNull();
  });

  it("removes a subscription", async () => {
    const kv = createMockKV();
    const repo = createSubscriptionRepository(kv);
    const service = createSubscriptionService(repo);

    const userKey = "user-key-123";
    const sub = {
      id: "sub-1",
      name: "Netflix",
      price: 12.99,
      currency: "EUR",
      billingCycle: "monthly" as const,
      nextBillingDate: "2026-06-01",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await service.create(userKey, sub, VALID_KEY);
    await service.remove(userKey, "sub-1");

    const list = await service.list(userKey, VALID_KEY);
    expect(list).toHaveLength(0);
  });

  it("isolates subscriptions between users", async () => {
    const kv = createMockKV();
    const repo = createSubscriptionRepository(kv);
    const service = createSubscriptionService(repo);

    const userA = "user-a";
    const userB = "user-b";

    await service.create(userA, {
      id: "sub-a",
      name: "Netflix",
      price: 12.99,
      currency: "EUR",
      billingCycle: "monthly",
      nextBillingDate: "2026-06-01",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, VALID_KEY);

    await service.create(userB, {
      id: "sub-b",
      name: "Spotify",
      price: 9.99,
      currency: "EUR",
      billingCycle: "monthly",
      nextBillingDate: "2026-06-15",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, VALID_KEY);

    const listA = await service.list(userA, VALID_KEY);
    const listB = await service.list(userB, VALID_KEY);

    expect(listA).toHaveLength(1);
    expect(listA[0].name).toBe("Netflix");
    expect(listB).toHaveLength(1);
    expect(listB[0].name).toBe("Spotify");
  });
});
