import { describe, it, expect, vi } from "vitest";
import type { KVNamespace } from "@cloudflare/workers-types";
import {
  listEditFieldCallback,
  listResumeCallback,
  listPageCallback,
} from "../src/bot/callbacks/listCallbacks.js";
import { createSubscriptionService } from "../src/services/subscriptionService.js";
import { createSubscriptionRepository } from "../src/repositories/subscriptionRepository.js";
import { createReminderRepository } from "../src/repositories/reminderRepository.js";

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
        .filter((k) => k.startsWith(prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true, cursor: "" };
    },
  } as unknown as KVNamespace;
}

function createListCallbackContext(
  data: string,
  options?: { rejectHide?: boolean; messageDate?: number; kv?: KVNamespace },
) {
  const editMessageReplyMarkup = options?.rejectHide
    ? vi.fn().mockRejectedValue(new Error("message is not modified"))
    : vi.fn().mockResolvedValue(undefined);

  const editMessageText = vi.fn().mockResolvedValue(undefined);

  return {
    userKey: "user-key",
    requestId: "request-id",
    env: {
      SUBSCRIPTION_KV: options?.kv ?? ({} as KVNamespace),
      ENCRYPTION_KEY: VALID_KEY,
    },
    callbackQuery: {
      data,
      message: options?.messageDate
        ? { date: options.messageDate }
        : undefined,
    },
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    editMessageReplyMarkup,
    editMessageText,
    conversation: {
      enter: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe("list manager callbacks", () => {
  it("hides the old panel keyboard before entering text field editing", async () => {
    const ctx = createListCallbackContext("list:ef:name:sub-1:2");

    await listEditFieldCallback(ctx as any);

    expect(ctx.answerCallbackQuery).toHaveBeenCalledTimes(1);
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalledWith({
      reply_markup: undefined,
    });
    expect(ctx.conversation.enter).toHaveBeenCalledWith(
      "editField",
      "sub-1",
      "name",
      { source: "listManager", page: 2 },
    );
  });

  it("hides the old panel keyboard before entering cycle editing", async () => {
    const ctx = createListCallbackContext("list:ef:cycle:sub-1:1");

    await listEditFieldCallback(ctx as any);

    expect(ctx.editMessageReplyMarkup).toHaveBeenCalledWith({
      reply_markup: undefined,
    });
    expect(ctx.conversation.enter).toHaveBeenCalledWith("editCycle", "sub-1", {
      source: "listManager",
      page: 1,
    });
  });

  it("enters editing even when hiding the old panel keyboard fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ctx = createListCallbackContext("list:ef:price:sub-1:0", {
      rejectHide: true,
    });

    await listEditFieldCallback(ctx as any);

    expect(ctx.editMessageReplyMarkup).toHaveBeenCalledWith({
      reply_markup: undefined,
    });
    expect(ctx.conversation.enter).toHaveBeenCalledWith(
      "editField",
      "sub-1",
      "price",
      { source: "listManager", page: 0 },
    );

    warnSpy.mockRestore();
  });

  it("hides the old panel keyboard before entering resume flow", async () => {
    const ctx = createListCallbackContext("list:resume:sub-1:3");

    await listResumeCallback(ctx as any);

    expect(ctx.answerCallbackQuery).toHaveBeenCalledTimes(1);
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalledWith({
      reply_markup: undefined,
    });
    expect(ctx.conversation.enter).toHaveBeenCalledWith("resume", "sub-1", {
      source: "listManager",
      page: 3,
    });
  });
});

describe("list panel age check", () => {
  it("fresh panel still works", async () => {
    const kv = createMockKV();
    const repo = createSubscriptionRepository(kv);
    const reminderRepo = createReminderRepository(kv);
    const service = createSubscriptionService(repo, reminderRepo);

    await service.create(
      "user-key",
      {
        id: "sub-1",
        name: "Netflix",
        price: 12.99,
        currency: "USD",
        billingCycle: "monthly",
        nextBillingDate: "2026-06-01",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      VALID_KEY,
    );

    const nowSeconds = Math.floor(Date.now() / 1000);
    const ctx = createListCallbackContext("list:page:0", {
      messageDate: nowSeconds - 60, // 1 minute old
      kv,
    });

    await listPageCallback(ctx as any);

    // Should answer the callback and render the list page
    expect(ctx.answerCallbackQuery).toHaveBeenCalledTimes(1);
    expect(ctx.editMessageText).toHaveBeenCalledTimes(1);

    const editedText = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(editedText).toContain("你的订阅 — 第 1/1 页");
  });

  it("old panel answers with expired-panel message", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const ctx = createListCallbackContext("list:page:0", {
      messageDate: nowSeconds - 3700, // more than 1 hour old
    });

    await listPageCallback(ctx as any);

    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
      "这个列表面板已过期，请发送 /list_full 重新打开。",
    );
  });

  it("old panel disables keyboard best-effort", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const ctx = createListCallbackContext("list:page:0", {
      messageDate: nowSeconds - 3700,
    });

    await listPageCallback(ctx as any);

    expect(ctx.editMessageReplyMarkup).toHaveBeenCalledWith({
      reply_markup: undefined,
    });
  });
});
