import { describe, expect, it, vi } from "vitest";
import type { KVNamespace } from "@cloudflare/workers-types";
import { deleteCommand } from "../src/bot/commands/delete.js";
import { exportCommand } from "../src/bot/commands/export.js";
import { pauseCommand } from "../src/bot/commands/pause.js";
import { resumeCommand } from "../src/bot/commands/resume.js";
import { viewCommand } from "../src/bot/commands/view.js";
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

describe("deleteCommand", () => {
  it("shows usage when id is missing", async () => {
    const kv = createMockKV();
    const ctx = createContext(kv, "/delete");

    await deleteCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("/delete <id>"),
    );
  });

  it("reports a missing subscription", async () => {
    const kv = createMockKV();
    const ctx = createContext(kv, "/delete missing");

    await deleteCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith("没有找到这个订阅。");
  });

  it("reports ambiguous short ids", async () => {
    const kv = createMockKV();
    await seedSubscription(kv, createSub({ id: "same-prefix-a" }));
    await seedSubscription(kv, createSub({ id: "same-prefix-b" }));
    const ctx = createContext(kv, "/delete same");

    await deleteCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      "这个短 ID 匹配了多个订阅，请使用完整 ID。",
    );
  });

  it("asks for confirmation for a resolved subscription", async () => {
    const kv = createMockKV();
    await seedSubscription(kv, createSub({ id: "delete-target" }));
    const ctx = createContext(kv, "/delete delete-target");

    await deleteCommand(ctx);

    const [text, options] = (ctx.reply as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(text).toContain("确认删除");
    expect(text).toContain("Netflix");
    expect(options.reply_markup.inline_keyboard.flat()).toEqual(
      expect.arrayContaining([
        { text: "✅ 确认", callback_data: "delete:confirm:delete-target" },
        { text: "❌ 取消", callback_data: "delete:cancel:delete-target" },
      ]),
    );
  });
});

describe("viewCommand", () => {
  it("shows usage when id is missing", async () => {
    const kv = createMockKV();
    const ctx = createContext(kv, "/view");

    await viewCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("/view <id>"),
    );
  });

  it("reports a missing subscription", async () => {
    const kv = createMockKV();
    const ctx = createContext(kv, "/view missing");

    await viewCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith("没有找到这个订阅。");
  });

  it("renders subscription details", async () => {
    const kv = createMockKV();
    await seedSubscription(kv, createSub({ id: "view-target" }));
    const ctx = createContext(kv, "/view view-target");

    await viewCommand(ctx);

    const replyText = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(replyText).toContain("Netflix");
    expect(replyText).toContain("价格：12.99 USD");
    expect(replyText).toContain("周期：每月");
    expect(replyText).toContain("状态：活跃");
    expect(replyText).toContain("分类：Video");
    expect(replyText).toContain("备注：family plan");
  });
});

describe("pauseCommand", () => {
  it("refuses when userKey is missing", async () => {
    const kv = createMockKV();
    const ctx = createContext(kv, "/pause sub-1", { userKey: undefined });

    await pauseCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith("无法识别用户，请稍后再试。");
  });

  it("shows usage when id is missing", async () => {
    const kv = createMockKV();
    const ctx = createContext(kv, "/pause");

    await pauseCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("/pause <id>"),
    );
  });

  it("reports ambiguous short ids", async () => {
    const kv = createMockKV();
    await seedSubscription(kv, createSub({ id: "pause-prefix-a" }));
    await seedSubscription(kv, createSub({ id: "pause-prefix-b" }));
    const ctx = createContext(kv, "/pause pause");

    await pauseCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      "这个短 ID 匹配了多个订阅，请使用完整 ID。",
    );
  });

  it("pauses a resolved subscription", async () => {
    const kv = createMockKV();
    await seedSubscription(kv, createSub({ id: "pause-target" }));
    const ctx = createContext(kv, "/pause pause-target");

    await pauseCommand(ctx);

    const replyText = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(replyText).toContain('已暂停"Netflix"');
    expect(replyText).toContain("状态：已暂停");
  });
});

describe("resumeCommand", () => {
  it("refuses when userKey is missing", async () => {
    const kv = createMockKV();
    const ctx = createContext(kv, "/resume sub-1", { userKey: undefined });

    await resumeCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith("无法识别用户，请稍后再试。");
  });

  it("shows usage when id is missing", async () => {
    const kv = createMockKV();
    const ctx = createContext(kv, "/resume");

    await resumeCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("/resume <id>"),
    );
  });

  it("reports a missing subscription", async () => {
    const kv = createMockKV();
    const ctx = createContext(kv, "/resume missing");

    await resumeCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith("没有找到这个订阅。");
  });

  it("enters the resume conversation for a resolved subscription", async () => {
    const kv = createMockKV();
    await seedSubscription(kv, createSub({ id: "resume-target" }));
    const ctx = createContext(kv, "/resume resume-target");

    await resumeCommand(ctx);

    expect(ctx.conversation.enter).toHaveBeenCalledWith(
      "resume",
      "resume-target",
    );
  });
});
