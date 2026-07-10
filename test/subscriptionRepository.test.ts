import { describe, expect, it } from "vitest";
import type { KVNamespace } from "@cloudflare/workers-types";
import { createSubscriptionRepository } from "../src/repositories/subscriptionRepository.js";
import type { StoredSubscription } from "../src/models/subscription.js";

function createStoredSubscription(id: string): StoredSubscription {
  return {
    id,
    encryptedPayload: "iv.ciphertext",
    nextBillingDate: "2026-06-01",
    billingCycle: "monthly",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function createPaginatedMockKV(pageSize = 2): KVNamespace {
  const store = new Map<string, string>();

  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    list: async (options?: { prefix?: string; cursor?: string }) => {
      const keys = Array.from(store.keys())
        .filter((key) => key.startsWith(options?.prefix ?? ""))
        .sort();
      const start = Number(options?.cursor ?? "0");
      const page = keys
        .slice(start, start + pageSize)
        .map((name) => ({ name }));
      const next = start + page.length;

      if (next < keys.length) {
        return { keys: page, list_complete: false, cursor: String(next) };
      }
      return { keys: page, list_complete: true };
    },
  } as unknown as KVNamespace;
}

describe("subscriptionRepository", () => {
  it("lists every subscription key across KV pages", async () => {
    const repo = createSubscriptionRepository(createPaginatedMockKV());

    await Promise.all(
      ["sub-1", "sub-2", "sub-3", "sub-4", "sub-5"].map((id) =>
        repo.save("user-1", createStoredSubscription(id)),
      ),
    );
    await repo.save("user-2", createStoredSubscription("other-user"));

    await expect(repo.listIds("user-1")).resolves.toEqual([
      "sub-1",
      "sub-2",
      "sub-3",
      "sub-4",
      "sub-5",
    ]);
  });

  it("does not need a mutable index to preserve concurrent saves", async () => {
    const repo = createSubscriptionRepository(createPaginatedMockKV());

    await Promise.all(
      ["sub-1", "sub-2", "sub-3"].map((id) =>
        repo.save("user-1", createStoredSubscription(id)),
      ),
    );

    await expect(repo.listIds("user-1")).resolves.toEqual([
      "sub-1",
      "sub-2",
      "sub-3",
    ]);
  });
});
