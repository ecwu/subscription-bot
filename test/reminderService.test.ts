import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  processReminderEntry,
  getReminderDaysAhead,
  getReminderDateRange,
} from "../src/services/reminderService.js";
import { createSubscriptionService } from "../src/services/subscriptionService.js";
import { createReminderRepository } from "../src/repositories/reminderRepository.js";
import { createSubscriptionRepository } from "../src/repositories/subscriptionRepository.js";
import { createUserRepository } from "../src/repositories/userRepository.js";
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

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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
  it("returns today-1 through today + daysAhead + 1 inclusive", () => {
    vi.setSystemTime(new Date("2026-05-20T00:00:00Z"));
    const range = getReminderDateRange(3);

    expect(range).toHaveLength(6);
    expect(range[0]).toBe("2026-05-19");
    expect(range[5]).toBe("2026-05-24");
    // Verify each date is one day apart
    for (let i = 1; i < range.length; i++) {
      const prev = new Date(range[i - 1] + "T00:00:00Z");
      const curr = new Date(range[i] + "T00:00:00Z");
      const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      expect(diff).toBe(1);
    }
  });
});

describe("processReminderEntry", () => {
  it("sends upcoming reminders during the user's exact local dispatch slot", async () => {
    vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));

    const kv = createMockKV();
    const reminderRepo = createReminderRepository(kv);
    const subRepo = createSubscriptionRepository(kv);
    const userRepo = createUserRepository(kv);
    const subscriptionService = createSubscriptionService(subRepo, reminderRepo);
    const env = createMockEnv();
    env.SUBSCRIPTION_KV = kv;

    const userKey = "user-1";
    const subId = "sub-1";
    const date = "2026-06-04";

    await userRepo.upsertUserProfile(userKey, 123456, VALID_KEY);
    await userRepo.updateUserSettings(
      userKey,
      {
        defaultCurrency: "USD",
        reminderEnabled: true,
        reminderHour: 8,
        timezone: "Asia/Shanghai",
      },
      VALID_KEY,
    );

    await subscriptionService.create(
      userKey,
      {
        id: subId,
        name: "Netflix",
        price: 12.99,
        currency: "EUR",
        billingCycle: "monthly",
        nextBillingDate: date,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      VALID_KEY,
    );

    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    global.fetch = mockFetch;

    const result = await processReminderEntry(
      env,
      reminderRepo,
      subRepo,
      userRepo,
      subscriptionService,
      { userKey, subscriptionId: subId },
      date,
      3,
    );

    expect(result.sent).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("skips upcoming reminders outside the exact local dispatch slot", async () => {
    vi.setSystemTime(new Date("2026-06-01T00:30:00Z"));

    const kv = createMockKV();
    const reminderRepo = createReminderRepository(kv);
    const subRepo = createSubscriptionRepository(kv);
    const userRepo = createUserRepository(kv);
    const subscriptionService = createSubscriptionService(subRepo, reminderRepo);
    const env = createMockEnv();
    env.SUBSCRIPTION_KV = kv;

    const userKey = "user-1";
    const subId = "sub-1";
    const date = "2026-06-04";

    await userRepo.upsertUserProfile(userKey, 123456, VALID_KEY);
    await userRepo.updateUserSettings(
      userKey,
      {
        defaultCurrency: "USD",
        reminderEnabled: true,
        reminderHour: 8,
        timezone: "Asia/Shanghai",
      },
      VALID_KEY,
    );

    await subscriptionService.create(
      userKey,
      {
        id: subId,
        name: "Netflix",
        price: 12.99,
        currency: "EUR",
        billingCycle: "monthly",
        nextBillingDate: date,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      VALID_KEY,
    );

    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    global.fetch = mockFetch;

    const result = await processReminderEntry(
      env,
      reminderRepo,
      subRepo,
      userRepo,
      subscriptionService,
      { userKey, subscriptionId: subId },
      date,
      3,
    );

    expect(result.sent).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips upcoming reminders before the configured reminder window", async () => {
    vi.setSystemTime(new Date("2026-06-01T09:00:00Z"));

    const kv = createMockKV();
    const reminderRepo = createReminderRepository(kv);
    const subRepo = createSubscriptionRepository(kv);
    const userRepo = createUserRepository(kv);
    const subscriptionService = createSubscriptionService(subRepo, reminderRepo);
    const env = createMockEnv();
    env.SUBSCRIPTION_KV = kv;

    const userKey = "user-1";
    const subId = "sub-1";
    const date = "2026-06-05";

    await userRepo.upsertUserProfile(userKey, 123456, VALID_KEY);
    await subscriptionService.create(
      userKey,
      {
        id: subId,
        name: "Netflix",
        billingCycle: "monthly",
        nextBillingDate: date,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      VALID_KEY,
    );

    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    global.fetch = mockFetch;

    await processReminderEntry(
      env,
      reminderRepo,
      subRepo,
      userRepo,
      subscriptionService,
      { userKey, subscriptionId: subId },
      date,
      3,
    );

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends a reminder in the dispatch slot without persisting sent state", async () => {
    vi.setSystemTime(new Date("2026-06-01T09:00:00Z"));

    const kv = createMockKV();
    const reminderRepo = createReminderRepository(kv);
    const subRepo = createSubscriptionRepository(kv);
    const userRepo = createUserRepository(kv);
    const subscriptionService = createSubscriptionService(subRepo, reminderRepo);
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

    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    global.fetch = mockFetch;

    await processReminderEntry(
      env,
      reminderRepo,
      subRepo,
      userRepo,
      subscriptionService,
      { userKey, subscriptionId: subId },
      date,
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(await reminderRepo.hasSent(userKey, subId, date)).toBe(false);
  });

  it("uses trial reminder wording for trial subscriptions", async () => {
    vi.setSystemTime(new Date("2026-06-01T09:00:00Z"));

    const kv = createMockKV();
    const reminderRepo = createReminderRepository(kv);
    const subRepo = createSubscriptionRepository(kv);
    const userRepo = createUserRepository(kv);
    const subscriptionService = createSubscriptionService(subRepo, reminderRepo);
    const env = createMockEnv();
    env.SUBSCRIPTION_KV = kv;

    const userKey = "user-1";
    const subId = "sub-1";
    const date = "2026-06-01";

    await userRepo.upsertUserProfile(userKey, 123456, VALID_KEY);

    const sub = {
      id: subId,
      name: "Trial Service",
      price: 12.99,
      currency: "EUR",
      billingCycle: "monthly" as const,
      nextBillingDate: date,
      isTrial: true,
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
      isTrial: true,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    });
    await reminderRepo.addEntry(date, userKey, subId);

    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    global.fetch = mockFetch;

    await processReminderEntry(
      env,
      reminderRepo,
      subRepo,
      userRepo,
      subscriptionService,
      { userKey, subscriptionId: subId },
      date,
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.text).toContain("体验到期提醒");
    expect(body.text).toContain("之后可能开始扣款");
  });

  it("uses service-end wording for non-renewing subscriptions", async () => {
    vi.setSystemTime(new Date("2026-06-01T09:00:00Z"));

    const kv = createMockKV();
    const reminderRepo = createReminderRepository(kv);
    const subRepo = createSubscriptionRepository(kv);
    const userRepo = createUserRepository(kv);
    const subscriptionService = createSubscriptionService(subRepo, reminderRepo);
    const env = createMockEnv();
    env.SUBSCRIPTION_KV = kv;

    const userKey = "user-1";
    const subId = "sub-1";
    const date = "2026-06-01";

    await userRepo.upsertUserProfile(userKey, 123456, VALID_KEY);

    const sub = {
      id: subId,
      name: "Cancelled Service",
      price: 12.99,
      currency: "EUR",
      billingCycle: "monthly" as const,
      nextBillingDate: date,
      autoRenew: false,
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
      autoRenew: false,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    });
    await reminderRepo.addEntry(date, userKey, subId);

    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    global.fetch = mockFetch;

    await processReminderEntry(
      env,
      reminderRepo,
      subRepo,
      userRepo,
      subscriptionService,
      { userKey, subscriptionId: subId },
      date,
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.text).toContain("服务到期提醒");
    expect(body.text).toContain("已关闭自动续费");
  });

  it("skips stale entries when subscription is missing", async () => {
    vi.setSystemTime(new Date("2026-06-01T09:00:00Z"));

    const kv = createMockKV();
    const reminderRepo = createReminderRepository(kv);
    const subRepo = createSubscriptionRepository(kv);
    const userRepo = createUserRepository(kv);
    const subscriptionService = createSubscriptionService(subRepo, reminderRepo);
    const env = createMockEnv();
    env.SUBSCRIPTION_KV = kv;

    const userKey = "user-1";
    const subId = "sub-1";
    const date = "2026-06-01";

    await userRepo.upsertUserProfile(userKey, 123456, VALID_KEY);
    await reminderRepo.addEntry(date, userKey, subId);

    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    global.fetch = mockFetch;

    await processReminderEntry(
      env,
      reminderRepo,
      subRepo,
      userRepo,
      subscriptionService,
      { userKey, subscriptionId: subId },
      date,
    );

    expect(mockFetch).not.toHaveBeenCalled();
    expect(await reminderRepo.hasSent(userKey, subId, date)).toBe(false);
  });

  it("skips stale entries when nextBillingDate mismatches", async () => {
    vi.setSystemTime(new Date("2026-06-01T09:00:00Z"));

    const kv = createMockKV();
    const reminderRepo = createReminderRepository(kv);
    const subRepo = createSubscriptionRepository(kv);
    const userRepo = createUserRepository(kv);
    const subscriptionService = createSubscriptionService(subRepo, reminderRepo);
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

    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    global.fetch = mockFetch;

    await processReminderEntry(
      env,
      reminderRepo,
      subRepo,
      userRepo,
      subscriptionService,
      { userKey, subscriptionId: subId },
      indexDate,
    );

    expect(mockFetch).not.toHaveBeenCalled();
    expect(await reminderRepo.hasSent(userKey, subId, indexDate)).toBe(false);
  });

  it("uses the dispatch slot instead of historical sent markers", async () => {
    vi.setSystemTime(new Date("2026-06-01T09:00:00Z"));

    const kv = createMockKV();
    const reminderRepo = createReminderRepository(kv);
    const subRepo = createSubscriptionRepository(kv);
    const userRepo = createUserRepository(kv);
    const subscriptionService = createSubscriptionService(subRepo, reminderRepo);
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

    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    global.fetch = mockFetch;

    await processReminderEntry(
      env,
      reminderRepo,
      subRepo,
      userRepo,
      subscriptionService,
      { userKey, subscriptionId: subId },
      date,
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns unsent when Telegram send fails", async () => {
    vi.setSystemTime(new Date("2026-06-01T09:00:00Z"));

    const kv = createMockKV();
    const reminderRepo = createReminderRepository(kv);
    const subRepo = createSubscriptionRepository(kv);
    const userRepo = createUserRepository(kv);
    const subscriptionService = createSubscriptionService(subRepo, reminderRepo);
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

    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ ok: false, description: "Chat not found" }),
          { status: 400 },
        ),
      );
    global.fetch = mockFetch;

    await processReminderEntry(
      env,
      reminderRepo,
      subRepo,
      userRepo,
      subscriptionService,
      { userKey, subscriptionId: subId },
      date,
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(await reminderRepo.hasSent(userKey, subId, date)).toBe(false);
  });

  it("skips when no user profile exists", async () => {
    vi.setSystemTime(new Date("2026-06-01T09:00:00Z"));

    const kv = createMockKV();
    const reminderRepo = createReminderRepository(kv);
    const subRepo = createSubscriptionRepository(kv);
    const userRepo = createUserRepository(kv);
    const subscriptionService = createSubscriptionService(subRepo, reminderRepo);
    const env = createMockEnv();
    env.SUBSCRIPTION_KV = kv;

    const userKey = "user-1";
    const subId = "sub-1";
    const date = "2026-06-01";

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

    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    global.fetch = mockFetch;

    await processReminderEntry(
      env,
      reminderRepo,
      subRepo,
      userRepo,
      subscriptionService,
      { userKey, subscriptionId: subId },
      date,
    );

    expect(mockFetch).not.toHaveBeenCalled();
    expect(await reminderRepo.hasSent(userKey, subId, date)).toBe(false);
  });

  it("skips when reminder hour has not passed", async () => {
    vi.setSystemTime(new Date("2026-06-01T08:00:00Z"));

    const kv = createMockKV();
    const reminderRepo = createReminderRepository(kv);
    const subRepo = createSubscriptionRepository(kv);
    const userRepo = createUserRepository(kv);
    const subscriptionService = createSubscriptionService(subRepo, reminderRepo);
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

    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    global.fetch = mockFetch;

    await processReminderEntry(
      env,
      reminderRepo,
      subRepo,
      userRepo,
      subscriptionService,
      { userKey, subscriptionId: subId },
      date,
    );

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("advances past-due on the billing date after sending", async () => {
    vi.setSystemTime(new Date("2026-06-01T09:00:00Z"));

    const kv = createMockKV();
    const reminderRepo = createReminderRepository(kv);
    const subRepo = createSubscriptionRepository(kv);
    const userRepo = createUserRepository(kv);
    const subscriptionService = createSubscriptionService(subRepo, reminderRepo);
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

    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    global.fetch = mockFetch;

    const result = await processReminderEntry(
      env,
      reminderRepo,
      subRepo,
      userRepo,
      subscriptionService,
      { userKey, subscriptionId: subId },
      date,
    );

    expect(result.sent).toBe(true);
    expect(result.advanced).toBe(true);

    const updatedSub = await subscriptionService.get(
      userKey,
      subId,
      VALID_KEY,
    );
    expect(updatedSub?.nextBillingDate).toBe("2026-07-01");
  });
});
