import { describe, expect, it, vi } from "vitest";
import type { Env } from "../src/types/env.js";

const grammyMock = vi.hoisted(() => ({
  webhookHandler: vi.fn(async () => new Response("ok", { status: 200 })),
  webhookCallback: vi.fn(),
}));

const botMock = vi.hoisted(() => ({
  createBot: vi.fn(() => ({ name: "bot" })),
}));

vi.mock("grammy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("grammy")>();
  return {
    ...actual,
    webhookCallback: grammyMock.webhookCallback,
  };
});

vi.mock("../src/bot/createBot.js", () => ({
  createBot: botMock.createBot,
}));

import { webhookCallback } from "grammy";
import { createBot } from "../src/bot/createBot.js";
import { handleWebhook } from "../src/handlers/webhook.js";

function createEnv(): Env {
  return {
    BOT_TOKEN: "token",
    TELEGRAM_WEBHOOK_SECRET: "expected-secret",
    ENCRYPTION_KEY: "key",
    USER_HASH_SECRET: "hash-secret",
    SUBSCRIPTION_KV: {} as Env["SUBSCRIPTION_KV"],
    APP_ENV: "test",
  };
}

function authorizedRequest(): Request {
  return new Request("https://example.test/telegram/webhook", {
    method: "POST",
    headers: { "X-Telegram-Bot-Api-Secret-Token": "expected-secret" },
    body: JSON.stringify({ update_id: 1 }),
  });
}

describe("handleWebhook success path", () => {
  it("creates a bot per request and delegates to grammY webhook callback", async () => {
    grammyMock.webhookCallback.mockReturnValue(grammyMock.webhookHandler);
    const env = createEnv();

    const first = await handleWebhook(authorizedRequest(), env);
    const second = await handleWebhook(authorizedRequest(), env);

    expect(first.status).toBe(200);
    expect(await first.text()).toBe("ok");
    expect(second.status).toBe(200);
    expect(createBot).toHaveBeenCalledTimes(2);
    expect(webhookCallback).toHaveBeenCalledTimes(2);
    expect(webhookCallback).toHaveBeenCalledWith(
      botMock.createBot.mock.results[0].value,
      "cloudflare-mod",
    );
    expect(grammyMock.webhookHandler).toHaveBeenCalledTimes(2);
  });
});
