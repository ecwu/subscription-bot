import { describe, it, expect } from "vitest";
import { createSubscriptionService } from "../src/services/subscriptionService.js";
import { createSubscriptionRepository } from "../src/repositories/subscriptionRepository.js";
import { createReminderRepository } from "../src/repositories/reminderRepository.js";
import type { KVNamespace } from "@cloudflare/workers-types";
import type { Subscription } from "../src/models/subscription.js";

const VALID_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString(
  "base64url",
);

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
    list: async (options?: {
      prefix?: string;
      limit?: number;
      cursor?: string;
    }) => {
      const prefix = options?.prefix ?? "";
      const keys = Array.from(store.keys())
        .filter((k) => k.startsWith(prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true, cursor: "" };
    },
  } as unknown as KVNamespace;
}

function createSub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: "sub-1",
    name: "Netflix",
    price: 12.99,
    currency: "EUR",
    billingCycle: "monthly",
    nextBillingDate: "2026-06-01",
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("subscriptionService status", () => {
  it("creates a subscription with active status by default", async () => {
    const kv = createMockKV();
    const repo = createSubscriptionRepository(kv);
    const reminderRepo = createReminderRepository(kv);
    const service = createSubscriptionService(repo, reminderRepo);

    const sub = createSub();
    await service.create("user-1", sub, VALID_KEY);

    const retrieved = await service.get("user-1", "sub-1", VALID_KEY);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.status).toBe("active");
  });

  it("creates a subscription with paused status", async () => {
    const kv = createMockKV();
    const repo = createSubscriptionRepository(kv);
    const reminderRepo = createReminderRepository(kv);
    const service = createSubscriptionService(repo, reminderRepo);

    const sub = createSub({ status: "paused" });
    await service.create("user-1", sub, VALID_KEY);

    const retrieved = await service.get("user-1", "sub-1", VALID_KEY);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.status).toBe("paused");
  });

  it("pauses an active subscription", async () => {
    const kv = createMockKV();
    const repo = createSubscriptionRepository(kv);
    const reminderRepo = createReminderRepository(kv);
    const service = createSubscriptionService(repo, reminderRepo);

    const sub = createSub();
    await service.create("user-1", sub, VALID_KEY);

    const paused = await service.pause("user-1", "sub-1", VALID_KEY);
    expect(paused).not.toBeNull();
    expect(paused!.status).toBe("paused");
    expect(paused!.name).toBe("Netflix");

    const retrieved = await service.get("user-1", "sub-1", VALID_KEY);
    expect(retrieved!.status).toBe("paused");
  });

  it("pausing an already paused subscription returns it as-is", async () => {
    const kv = createMockKV();
    const repo = createSubscriptionRepository(kv);
    const reminderRepo = createReminderRepository(kv);
    const service = createSubscriptionService(repo, reminderRepo);

    const sub = createSub({ status: "paused" });
    await service.create("user-1", sub, VALID_KEY);

    const paused = await service.pause("user-1", "sub-1", VALID_KEY);
    expect(paused).not.toBeNull();
    expect(paused!.status).toBe("paused");
  });

  it("pause removes the reminder index entry", async () => {
    const kv = createMockKV();
    const repo = createSubscriptionRepository(kv);
    const reminderRepo = createReminderRepository(kv);
    const service = createSubscriptionService(repo, reminderRepo);

    const sub = createSub({ nextBillingDate: "2026-06-01" });
    await service.create("user-1", sub, VALID_KEY);

    expect(await reminderRepo.listEntries("2026-06-01")).toHaveLength(1);

    await service.pause("user-1", "sub-1", VALID_KEY);

    expect(await reminderRepo.listEntries("2026-06-01")).toHaveLength(0);
  });

  it("resumes a paused subscription with same date", async () => {
    const kv = createMockKV();
    const repo = createSubscriptionRepository(kv);
    const reminderRepo = createReminderRepository(kv);
    const service = createSubscriptionService(repo, reminderRepo);

    const sub = createSub({ nextBillingDate: "2026-06-01" });
    await service.create("user-1", sub, VALID_KEY);

    await service.pause("user-1", "sub-1", VALID_KEY);
    expect(await reminderRepo.listEntries("2026-06-01")).toHaveLength(0);

    const resumed = await service.resume("user-1", "sub-1", VALID_KEY);
    expect(resumed).not.toBeNull();
    expect(resumed!.status).toBe("active");
    expect(resumed!.nextBillingDate).toBe("2026-06-01");

    const retrieved = await service.get("user-1", "sub-1", VALID_KEY);
    expect(retrieved!.status).toBe("active");

    expect(await reminderRepo.listEntries("2026-06-01")).toHaveLength(1);
  });

  it("resumes a paused subscription with a new date", async () => {
    const kv = createMockKV();
    const repo = createSubscriptionRepository(kv);
    const reminderRepo = createReminderRepository(kv);
    const service = createSubscriptionService(repo, reminderRepo);

    const sub = createSub({ nextBillingDate: "2026-06-01" });
    await service.create("user-1", sub, VALID_KEY);

    await service.pause("user-1", "sub-1", VALID_KEY);

    const resumed = await service.resume(
      "user-1",
      "sub-1",
      VALID_KEY,
      "2026-08-01",
    );
    expect(resumed).not.toBeNull();
    expect(resumed!.status).toBe("active");
    expect(resumed!.nextBillingDate).toBe("2026-08-01");

    expect(await reminderRepo.listEntries("2026-06-01")).toHaveLength(0);
    expect(await reminderRepo.listEntries("2026-08-01")).toHaveLength(1);
  });

  it("resuming an already active subscription returns it as-is", async () => {
    const kv = createMockKV();
    const repo = createSubscriptionRepository(kv);
    const reminderRepo = createReminderRepository(kv);
    const service = createSubscriptionService(repo, reminderRepo);

    const sub = createSub();
    await service.create("user-1", sub, VALID_KEY);

    const resumed = await service.resume("user-1", "sub-1", VALID_KEY);
    expect(resumed).not.toBeNull();
    expect(resumed!.status).toBe("active");
  });

  it("advancePastDue skips paused subscriptions", async () => {
    const kv = createMockKV();
    const repo = createSubscriptionRepository(kv);
    const reminderRepo = createReminderRepository(kv);
    const service = createSubscriptionService(repo, reminderRepo);

    const sub = createSub({
      nextBillingDate: "2026-01-31",
      billingAnchorDay: 31,
      status: "paused",
    });
    await service.create("user-1", sub, VALID_KEY);

    const advanced = await service.advancePastDue(
      "user-1",
      "sub-1",
      VALID_KEY,
      "2026-02-28",
    );

    expect(advanced).not.toBeNull();
    expect(advanced!.status).toBe("paused");
    expect(advanced!.nextBillingDate).toBe("2026-01-31");
  });

  it("defaults missing status to active for legacy data", async () => {
    const kv = createMockKV();
    const repo = createSubscriptionRepository(kv);
    const reminderRepo = createReminderRepository(kv);
    const service = createSubscriptionService(repo, reminderRepo);

    const { encrypt, serializeEncryptedPayload } = await import(
      "../src/crypto/encryption.js"
    );

    const subWithoutStatus = {
      id: "sub-1",
      name: "Netflix",
      billingCycle: "monthly" as const,
      nextBillingDate: "2026-06-01",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const encrypted = await encrypt(
      JSON.stringify(subWithoutStatus),
      VALID_KEY,
    );
    await repo.save("user-1", {
      id: "sub-1",
      encryptedPayload: serializeEncryptedPayload(encrypted),
      nextBillingDate: "2026-06-01",
      billingCycle: "monthly",
      status: "active",
      createdAt: subWithoutStatus.createdAt,
      updatedAt: subWithoutStatus.updatedAt,
    });
    await reminderRepo.addEntry("2026-06-01", "user-1", "sub-1");

    const retrieved = await service.get("user-1", "sub-1", VALID_KEY);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.status).toBe("active");
    expect(retrieved!.isTrial).toBe(false);
    expect(retrieved!.autoRenew).toBe(true);
  });

  it("does not advance trial subscriptions but keeps their reminder entry", async () => {
    const kv = createMockKV();
    const repo = createSubscriptionRepository(kv);
    const reminderRepo = createReminderRepository(kv);
    const service = createSubscriptionService(repo, reminderRepo);

    const sub = createSub({
      nextBillingDate: "2026-01-31",
      billingAnchorDay: 31,
      isTrial: true,
    });
    await service.create("user-1", sub, VALID_KEY);

    const advanced = await service.advancePastDue(
      "user-1",
      "sub-1",
      VALID_KEY,
      "2026-02-28",
    );

    expect(advanced).not.toBeNull();
    expect(advanced!.nextBillingDate).toBe("2026-01-31");
    expect(await reminderRepo.listEntries("2026-01-31")).toEqual([
      { userKey: "user-1", subscriptionId: "sub-1" },
    ]);
  });

  it("does not advance non-renewing subscriptions", async () => {
    const kv = createMockKV();
    const repo = createSubscriptionRepository(kv);
    const reminderRepo = createReminderRepository(kv);
    const service = createSubscriptionService(repo, reminderRepo);

    const sub = createSub({
      nextBillingDate: "2026-01-31",
      billingAnchorDay: 31,
      autoRenew: false,
    });
    await service.create("user-1", sub, VALID_KEY);

    const advanced = await service.advancePastDue(
      "user-1",
      "sub-1",
      VALID_KEY,
      "2026-02-28",
    );

    expect(advanced).not.toBeNull();
    expect(advanced!.nextBillingDate).toBe("2026-01-31");
  });

  it("pause returns null for non-existent subscription", async () => {
    const kv = createMockKV();
    const repo = createSubscriptionRepository(kv);
    const reminderRepo = createReminderRepository(kv);
    const service = createSubscriptionService(repo, reminderRepo);

    const result = await service.pause("user-1", "nonexistent", VALID_KEY);
    expect(result).toBeNull();
  });

  it("resume returns null for non-existent subscription", async () => {
    const kv = createMockKV();
    const repo = createSubscriptionRepository(kv);
    const reminderRepo = createReminderRepository(kv);
    const service = createSubscriptionService(repo, reminderRepo);

    const result = await service.resume("user-1", "nonexistent", VALID_KEY);
    expect(result).toBeNull();
  });
});
