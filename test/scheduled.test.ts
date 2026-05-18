import { describe, it, expect, vi, afterEach } from "vitest";
import { handleScheduled } from "../src/handlers/scheduled.js";
import { createSubscriptionRepository } from "../src/repositories/subscriptionRepository.js";
import { createReminderRepository } from "../src/repositories/reminderRepository.js";
import { createUserRepository } from "../src/repositories/userRepository.js";
import { createSubscriptionService } from "../src/services/subscriptionService.js";
import { Env } from "../src/types/env.js";
import type { KVNamespace } from "@cloudflare/workers-types";

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

function createMockEnv(kv: KVNamespace): Env {
  return {
    BOT_TOKEN: "test-token",
    TELEGRAM_WEBHOOK_SECRET: "test-secret",
    ENCRYPTION_KEY: VALID_KEY,
    USER_HASH_SECRET: "test-hash-secret",
    SUBSCRIPTION_KV: kv,
    REMINDER_DAYS_AHEAD: "3",
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("handleScheduled", () => {
  it("sends an early reminder without advancing the billing date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T00:00:00Z"));

    const kv = createMockKV();
    const env = createMockEnv(kv);
    const subRepo = createSubscriptionRepository(kv);
    const reminderRepo = createReminderRepository(kv);
    const userRepo = createUserRepository(kv);
    const service = createSubscriptionService(subRepo, reminderRepo);

    await userRepo.upsertUserProfile("user-1", 123456, VALID_KEY);
    await service.create(
      "user-1",
      {
        id: "sub-1",
        name: "Netflix",
        billingCycle: "monthly",
        nextBillingDate: "2026-05-18",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      VALID_KEY,
    );

    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

    await handleScheduled({} as ScheduledController, env);

    const sub = await service.get("user-1", "sub-1", VALID_KEY);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(sub?.nextBillingDate).toBe("2026-05-18");
  });

  it("advances due subscriptions even when the reminder send fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T00:00:00Z"));

    const kv = createMockKV();
    const env = createMockEnv(kv);
    const subRepo = createSubscriptionRepository(kv);
    const reminderRepo = createReminderRepository(kv);
    const userRepo = createUserRepository(kv);
    const service = createSubscriptionService(subRepo, reminderRepo);

    await userRepo.upsertUserProfile("user-1", 123456, VALID_KEY);
    await service.create(
      "user-1",
      {
        id: "sub-1",
        name: "Netflix",
        billingCycle: "monthly",
        nextBillingDate: "2026-05-18",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      VALID_KEY,
    );

    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: false }), { status: 400 }),
      );

    await handleScheduled({} as ScheduledController, env);

    const sub = await service.get("user-1", "sub-1", VALID_KEY);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(sub?.nextBillingDate).toBe("2026-06-18");
    expect(await reminderRepo.listEntries("2026-05-18")).toEqual([]);
    expect(await reminderRepo.listEntries("2026-06-18")).toEqual([
      { userKey: "user-1", subscriptionId: "sub-1" },
    ]);
  });
});
