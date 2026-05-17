import { describe, it, expect, vi } from "vitest";
import {
  createReminderService,
  getReminderDaysAhead,
  getReminderDateRange,
} from "../src/services/reminderService.js";
import { createReminderRepository } from "../src/repositories/reminderRepository.js";
import { createSubscriptionRepository } from "../src/repositories/subscriptionRepository.js";
import { createUserRepository } from "../src/repositories/userRepository.js";
import { Env } from "../src/types/env.js";
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

function createMockEnv(): Env {
  return {
    BOT_TOKEN: "test-token",
    TELEGRAM_WEBHOOK_SECRET: "test-secret",
    ENCRYPTION_KEY: VALID_KEY,
    USER_HASH_SECRET: "test-hash-secret",
    SUBSCRIPTION_KV: {} as unknown as KVNamespace,
    REMINDER_DAYS_AHEAD: "3",
  };
}

describe("getReminderDaysAhead", () => {
  it("defaults to 3 when missing", () => {
    const env = createMockEnv();
    delete (env as Record<string, unknown>).REMINDER_DAYS_AHEAD;
    expect(getReminderDaysAhead(env)).toBe(3);
  });

  it("defaults to 3 for invalid string", () => {
    const env = createMockEnv();
    env.REMINDER_DAYS_AHEAD = "not-a-number";
    expect(getReminderDaysAhead(env)).toBe(3);
  });

  it("defaults to 3 for negative number", () => {
    const env = createMockEnv();
    env.REMINDER_DAYS_AHEAD = "-1";
    expect(getReminderDaysAhead(env)).toBe(3);
  });

  it("parses a valid positive integer", () => {
    const env = createMockEnv();
    env.REMINDER_DAYS_AHEAD = "7";
    expect(getReminderDaysAhead(env)).toBe(7);
  });

  it("floors a decimal", () => {
    const env = createMockEnv();
    env.REMINDER_DAYS_AHEAD = "3.9";
    expect(getReminderDaysAhead(env)).toBe(3);
  });
});

describe("getReminderDateRange", () => {
  it("returns today through today + daysAhead inclusive", () => {
    const today = new Date().toISOString().split("T")[0];
    const range = getReminderDateRange(3);

    expect(range).toHaveLength(4);
    expect(range[0]).toBe(today);
    // Verify each date is one day apart
    for (let i = 1; i < range.length; i++) {
      const prev = new Date(range[i - 1] + "T00:00:00Z");
      const curr = new Date(range[i] + "T00:00:00Z");
      const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      expect(diff).toBe(1);
    }
  });
});

describe("reminderService.processDay", () => {
  it("sends a reminder and marks it sent", async () => {
    const kv = createMockKV();
    const reminderRepo = createReminderRepository(kv);
    const subRepo = createSubscriptionRepository(kv);
    const userRepo = createUserRepository(kv);
    const env = createMockEnv();
    env.SUBSCRIPTION_KV = kv;

    const userKey = "user-1";
    const subId = "sub-1";
    const date = "2026-06-01";

    // Store user profile with encrypted chatId
    await userRepo.upsertUserProfile(userKey, 123456, VALID_KEY);

    // Store subscription
    const sub = {
      id: subId,
      name: "Netflix",
      price: 12.99,
      currency: "EUR",
      billingCycle: "monthly" as const,
      nextBillingDate: date,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await subRepo.save(userKey, {
      id: subId,
      encryptedPayload: await (async () => {
        const { encrypt, serializeEncryptedPayload } = await import(
          "../src/crypto/encryption.js"
        );
        const encrypted = await encrypt(JSON.stringify(sub), VALID_KEY);
        return serializeEncryptedPayload(encrypted);
      })(),
      nextBillingDate: date,
      billingCycle: "monthly",
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    });

    // Add reminder index entry
    await reminderRepo.addEntry(date, userKey, subId);

    // Mock successful Telegram API call
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    global.fetch = mockFetch;

    const service = createReminderService(env, reminderRepo, subRepo, userRepo);
    await service.processDay(date);

    // Should have sent the message
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Should have marked as sent
    expect(await reminderRepo.hasSent(userKey, subId, date)).toBe(true);
  });

  it("skips stale entries when subscription is missing", async () => {
    const kv = createMockKV();
    const reminderRepo = createReminderRepository(kv);
    const subRepo = createSubscriptionRepository(kv);
    const userRepo = createUserRepository(kv);
    const env = createMockEnv();
    env.SUBSCRIPTION_KV = kv;

    const userKey = "user-1";
    const subId = "sub-1";
    const date = "2026-06-01";

    await userRepo.upsertUserProfile(userKey, 123456, VALID_KEY);
    await reminderRepo.addEntry(date, userKey, subId);
    // No subscription stored

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    global.fetch = mockFetch;

    const service = createReminderService(env, reminderRepo, subRepo, userRepo);
    await service.processDay(date);

    // Should not send anything
    expect(mockFetch).not.toHaveBeenCalled();
    // Should not mark sent
    expect(await reminderRepo.hasSent(userKey, subId, date)).toBe(false);
  });

  it("skips stale entries when nextBillingDate mismatches", async () => {
    const kv = createMockKV();
    const reminderRepo = createReminderRepository(kv);
    const subRepo = createSubscriptionRepository(kv);
    const userRepo = createUserRepository(kv);
    const env = createMockEnv();
    env.SUBSCRIPTION_KV = kv;

    const userKey = "user-1";
    const subId = "sub-1";
    const indexDate = "2026-06-01";
    const actualDate = "2026-07-01";

    await userRepo.upsertUserProfile(userKey, 123456, VALID_KEY);

    const sub = {
      id: subId,
      name: "Netflix",
      price: 12.99,
      currency: "EUR",
      billingCycle: "monthly" as const,
      nextBillingDate: actualDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await subRepo.save(userKey, {
      id: subId,
      encryptedPayload: await (async () => {
        const { encrypt, serializeEncryptedPayload } = await import(
          "../src/crypto/encryption.js"
        );
        const encrypted = await encrypt(JSON.stringify(sub), VALID_KEY);
        return serializeEncryptedPayload(encrypted);
      })(),
      nextBillingDate: actualDate,
      billingCycle: "monthly",
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    });

    await reminderRepo.addEntry(indexDate, userKey, subId);

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    global.fetch = mockFetch;

    const service = createReminderService(env, reminderRepo, subRepo, userRepo);
    await service.processDay(indexDate);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(await reminderRepo.hasSent(userKey, subId, indexDate)).toBe(false);
  });

  it("skips already-sent reminders", async () => {
    const kv = createMockKV();
    const reminderRepo = createReminderRepository(kv);
    const subRepo = createSubscriptionRepository(kv);
    const userRepo = createUserRepository(kv);
    const env = createMockEnv();
    env.SUBSCRIPTION_KV = kv;

    const userKey = "user-1";
    const subId = "sub-1";
    const date = "2026-06-01";

    await userRepo.upsertUserProfile(userKey, 123456, VALID_KEY);

    const sub = {
      id: subId,
      name: "Netflix",
      price: 12.99,
      currency: "EUR",
      billingCycle: "monthly" as const,
      nextBillingDate: date,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await subRepo.save(userKey, {
      id: subId,
      encryptedPayload: await (async () => {
        const { encrypt, serializeEncryptedPayload } = await import(
          "../src/crypto/encryption.js"
        );
        const encrypted = await encrypt(JSON.stringify(sub), VALID_KEY);
        return serializeEncryptedPayload(encrypted);
      })(),
      nextBillingDate: date,
      billingCycle: "monthly",
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    });

    await reminderRepo.addEntry(date, userKey, subId);
    await reminderRepo.markSent(userKey, subId, date);

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    global.fetch = mockFetch;

    const service = createReminderService(env, reminderRepo, subRepo, userRepo);
    await service.processDay(date);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not mark sent when Telegram send fails", async () => {
    const kv = createMockKV();
    const reminderRepo = createReminderRepository(kv);
    const subRepo = createSubscriptionRepository(kv);
    const userRepo = createUserRepository(kv);
    const env = createMockEnv();
    env.SUBSCRIPTION_KV = kv;

    const userKey = "user-1";
    const subId = "sub-1";
    const date = "2026-06-01";

    await userRepo.upsertUserProfile(userKey, 123456, VALID_KEY);

    const sub = {
      id: subId,
      name: "Netflix",
      price: 12.99,
      currency: "EUR",
      billingCycle: "monthly" as const,
      nextBillingDate: date,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await subRepo.save(userKey, {
      id: subId,
      encryptedPayload: await (async () => {
        const { encrypt, serializeEncryptedPayload } = await import(
          "../src/crypto/encryption.js"
        );
        const encrypted = await encrypt(JSON.stringify(sub), VALID_KEY);
        return serializeEncryptedPayload(encrypted);
      })(),
      nextBillingDate: date,
      billingCycle: "monthly",
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    });

    await reminderRepo.addEntry(date, userKey, subId);

    // Mock failed Telegram API call
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ ok: false, description: "Chat not found" }),
        { status: 400 }
      )
    );
    global.fetch = mockFetch;

    const service = createReminderService(env, reminderRepo, subRepo, userRepo);
    await service.processDay(date);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(await reminderRepo.hasSent(userKey, subId, date)).toBe(false);
  });

  it("skips when no user profile exists", async () => {
    const kv = createMockKV();
    const reminderRepo = createReminderRepository(kv);
    const subRepo = createSubscriptionRepository(kv);
    const userRepo = createUserRepository(kv);
    const env = createMockEnv();
    env.SUBSCRIPTION_KV = kv;

    const userKey = "user-1";
    const subId = "sub-1";
    const date = "2026-06-01";

    // No user profile stored

    const sub = {
      id: subId,
      name: "Netflix",
      price: 12.99,
      currency: "EUR",
      billingCycle: "monthly" as const,
      nextBillingDate: date,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await subRepo.save(userKey, {
      id: subId,
      encryptedPayload: await (async () => {
        const { encrypt, serializeEncryptedPayload } = await import(
          "../src/crypto/encryption.js"
        );
        const encrypted = await encrypt(JSON.stringify(sub), VALID_KEY);
        return serializeEncryptedPayload(encrypted);
      })(),
      nextBillingDate: date,
      billingCycle: "monthly",
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    });

    await reminderRepo.addEntry(date, userKey, subId);

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    global.fetch = mockFetch;

    const service = createReminderService(env, reminderRepo, subRepo, userRepo);
    await service.processDay(date);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(await reminderRepo.hasSent(userKey, subId, date)).toBe(false);
  });
});
