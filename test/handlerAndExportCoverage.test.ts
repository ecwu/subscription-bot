import { describe, expect, it, vi } from "vitest";
import { handleHealth } from "../src/handlers/health.js";
import { handleWebhook } from "../src/handlers/webhook.js";
import { createExportService } from "../src/services/exportService.js";
import type { Env } from "../src/types/env.js";

describe("handleHealth", () => {
  it("returns a JSON ok response", async () => {
    const response = handleHealth();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    const body = (await response.json()) as { status: string; timestamp: string };
    expect(body.status).toBe("ok");
    expect(new Date(body.timestamp).toString()).not.toBe("Invalid Date");
  });
});

describe("handleWebhook", () => {
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

  it("rejects requests without Telegram webhook secret", async () => {
    const request = new Request("https://example.test/webhook", {
      method: "POST",
    });

    const response = await handleWebhook(request, createEnv());

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Unauthorized");
  });

  it("rejects requests with the wrong Telegram webhook secret", async () => {
    const request = new Request("https://example.test/webhook", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "wrong-secret" },
    });

    const response = await handleWebhook(request, createEnv());

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Unauthorized");
  });
});

describe("exportService", () => {
  it("returns the stable export envelope from the subscription service", async () => {
    const subscriptions = [
      {
        id: "sub-1",
        name: "Netflix",
        billingCycle: "monthly" as const,
        nextBillingDate: "2026-06-01",
        status: "active" as const,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const subscriptionService = {
      list: vi.fn().mockResolvedValue(subscriptions),
    };
    const service = createExportService(subscriptionService as any);

    const exported = await service.exportUserData("user-key", "encryption-key");

    expect(subscriptionService.list).toHaveBeenCalledWith(
      "user-key",
      "encryption-key",
    );
    expect(exported).toEqual({
      version: "1.0.0",
      exportedAt: expect.any(String),
      subscriptions,
    });
  });
});
