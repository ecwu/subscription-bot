import { describe, it, expect } from "vitest";
import { createSubscriptionService } from "../src/services/subscriptionService.js";
import { createSubscriptionRepository } from "../src/repositories/subscriptionRepository.js";
import { createReminderRepository } from "../src/repositories/reminderRepository.js";
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

describe("subscriptionService.resolveId", () => {
  it("resolves exact full ID", async () => {
    const kv = createMockKV();
    const repo = createSubscriptionRepository(kv);
    const reminderRepo = createReminderRepository(kv);
    const service = createSubscriptionService(repo, reminderRepo);

    const userKey = "user-1";
    const fullId = "aaaaaaaa-1111-2222-3333-444444444444";

    await service.create(
      userKey,
      {
        id: fullId,
        name: "Test",
        price: 1,
        currency: "EUR",
        billingCycle: "monthly",
        nextBillingDate: "2026-06-01",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      VALID_KEY
    );

    const result = await service.resolveId(userKey, fullId, VALID_KEY);
    expect(result).toEqual({ kind: "found", id: fullId });
  });

  it("resolves short ID", async () => {
    const kv = createMockKV();
    const repo = createSubscriptionRepository(kv);
    const reminderRepo = createReminderRepository(kv);
    const service = createSubscriptionService(repo, reminderRepo);

    const userKey = "user-1";
    const fullId = "aaaaaaaa-1111-2222-3333-444444444444";

    await service.create(
      userKey,
      {
        id: fullId,
        name: "Test",
        price: 1,
        currency: "EUR",
        billingCycle: "monthly",
        nextBillingDate: "2026-06-01",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      VALID_KEY
    );

    const result = await service.resolveId(userKey, "aaaaaaaa", VALID_KEY);
    expect(result).toEqual({ kind: "found", id: fullId });
  });

  it("returns not_found for non-existent ID", async () => {
    const kv = createMockKV();
    const repo = createSubscriptionRepository(kv);
    const reminderRepo = createReminderRepository(kv);
    const service = createSubscriptionService(repo, reminderRepo);

    const result = await service.resolveId("user-1", "notexist", VALID_KEY);
    expect(result).toEqual({ kind: "not_found" });
  });

  it("returns ambiguous for multiple matching short IDs", async () => {
    const kv = createMockKV();
    const repo = createSubscriptionRepository(kv);
    const reminderRepo = createReminderRepository(kv);
    const service = createSubscriptionService(repo, reminderRepo);

    const userKey = "user-1";

    await service.create(
      userKey,
      {
        id: "aaaaaaaa-1111-2222-3333-444444444444",
        name: "Sub A",
        price: 1,
        currency: "EUR",
        billingCycle: "monthly",
        nextBillingDate: "2026-06-01",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      VALID_KEY
    );

    await service.create(
      userKey,
      {
        id: "aaaaaaaa-2222-3333-4444-555555555555",
        name: "Sub B",
        price: 2,
        currency: "EUR",
        billingCycle: "monthly",
        nextBillingDate: "2026-07-01",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      VALID_KEY
    );

    const result = await service.resolveId(userKey, "aaaaaaaa", VALID_KEY);
    expect(result).toEqual({ kind: "ambiguous", matches: ["aaaaaaaa", "aaaaaaaa"] });
  });

  it("does not leak other users' subscriptions", async () => {
    const kv = createMockKV();
    const repo = createSubscriptionRepository(kv);
    const reminderRepo = createReminderRepository(kv);
    const service = createSubscriptionService(repo, reminderRepo);

    const userA = "user-a";
    const userB = "user-b";
    const fullId = "bbbbbbbb-1111-2222-3333-444444444444";

    await service.create(
      userA,
      {
        id: fullId,
        name: "Secret",
        price: 1,
        currency: "EUR",
        billingCycle: "monthly",
        nextBillingDate: "2026-06-01",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      VALID_KEY
    );

    const result = await service.resolveId(userB, "bbbbbbbb", VALID_KEY);
    expect(result).toEqual({ kind: "not_found" });
  });

  it("resolves by prefix of full ID", async () => {
    const kv = createMockKV();
    const repo = createSubscriptionRepository(kv);
    const reminderRepo = createReminderRepository(kv);
    const service = createSubscriptionService(repo, reminderRepo);

    const userKey = "user-1";
    const fullId = "cccccccc-1111-2222-3333-444444444444";

    await service.create(
      userKey,
      {
        id: fullId,
        name: "Test",
        price: 1,
        currency: "EUR",
        billingCycle: "monthly",
        nextBillingDate: "2026-06-01",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      VALID_KEY
    );

    const result = await service.resolveId(
      userKey,
      "cccccccc-1111",
      VALID_KEY
    );
    expect(result).toEqual({ kind: "found", id: fullId });
  });
});
