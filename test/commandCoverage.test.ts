import { describe, expect, it, vi } from "vitest";
import type { KVNamespace } from "@cloudflare/workers-types";
import { exportCommand } from "../src/bot/commands/export.js";
import { createReminderRepository } from "../src/repositories/reminderRepository.js";
import { createSubscriptionRepository } from "../src/repositories/subscriptionRepository.js";
import { createSubscriptionService } from "../src/services/subscriptionService.js";
import type { Subscription } from "../src/models/subscription.js";
import type { BotContext } from "../src/types/context.js";

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
    list: async (options?: { prefix?: string }) => {
      const prefix = options?.prefix ?? "";
      const keys = Array.from(store.keys())
        .filter((key) => key.startsWith(prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true, cursor: "" };
    },
  } as unknown as KVNamespace;
}

function createContext(
  kv: KVNamespace,
  text: string,
  overrides: Partial<BotContext> = {},
): BotContext {
  return {
    env: {
      BOT_TOKEN: "token",
      TELEGRAM_WEBHOOK_SECRET: "secret",
      ENCRYPTION_KEY: VALID_KEY,
      USER_HASH_SECRET: "hash-secret",
      SUBSCRIPTION_KV: kv,
      APP_ENV: "test",
    },
    userKey: "user-key",
    requestId: "request-id",
    msg: { text },
    reply: vi.fn(),
    conversation: {
      enter: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  } as unknown as BotContext;
}

function createSub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: "sub-12345678",
    name: "Netflix",
    price: 12.99,
    currency: "USD",
    billingCycle: "monthly",
    nextBillingDate: "2026-06-01",
    category: "Video",
    note: "family plan",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

async function seedSubscription(
  kv: KVNamespace,
  sub: Subscription,
): Promise<void> {
  const repo = createSubscriptionRepository(kv);
  const reminderRepo = createReminderRepository(kv);
  const service = createSubscriptionService(repo, reminderRepo);
  await service.create("user-key", sub, VALID_KEY);
}

describe("exportCommand", () => {
  it("refuses when userKey is missing", async () => {
    const kv = createMockKV();
    const ctx = createContext(kv, "/export", { userKey: undefined });

    await exportCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith("无法识别用户，请稍后再试。");
  });

  it("exports subscriptions as Markdown JSON without internal identifiers", async () => {
    const kv = createMockKV();
    await seedSubscription(kv, createSub({ id: "sub-export" }));
    const ctx = createContext(kv, "/export");

    await exportCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const [text, options] = (ctx.reply as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(text).toContain("```json");
    expect(text).toContain('"version": 2');
    expect(text).toContain('"name": "Netflix"');
    expect(text).not.toContain("user-key");
    expect(text).not.toContain("userKey");
    expect(text).not.toContain("encryptedPayload");
    expect(text).not.toContain("123456789");
    expect(options).toEqual({ parse_mode: "MarkdownV2" });
  });

  it("reports when the export is too large for a Telegram message", async () => {
    const kv = createMockKV();
    for (let index = 0; index < 35; index += 1) {
      await seedSubscription(
        kv,
        createSub({
          id: `sub-large-${index}`,
          name: `Service ${index}`,
          note: "x".repeat(180),
        }),
      );
    }
    const ctx = createContext(kv, "/export");

    await exportCommand(ctx);

    const replyText = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(replyText).toContain("导出内容太大");
  });
});
