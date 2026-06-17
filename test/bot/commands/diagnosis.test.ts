import { describe, expect, it, vi } from "vitest";
import {
  buildDiagnosisChecks,
  buildDiagnosisReport,
  diagnosisCommand,
} from "../../../src/bot/commands/diagnosis.js";
import type { KVNamespace } from "@cloudflare/workers-types";
import type { BotContext } from "../../../src/types/context.js";
import type { Env } from "../../../src/types/env.js";

const VALID_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString(
  "base64url",
);

function createMockKV(): KVNamespace {
  return {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
  } as unknown as KVNamespace;
}

function createEnv(overrides: Partial<Env> = {}): Env {
  return {
    BOT_TOKEN: "bot-token",
    TELEGRAM_WEBHOOK_SECRET: "webhook-secret",
    ENCRYPTION_KEY: VALID_KEY,
    USER_HASH_SECRET: "hash-secret",
    ADMIN_USER_ID: "123456",
    SUBSCRIPTION_KV: createMockKV(),
    APP_ENV: "test",
    REMINDER_DAYS_AHEAD: "3",
    ...overrides,
  };
}

function createMockContext(overrides: Partial<BotContext> = {}): BotContext {
  return {
    isAdmin: true,
    env: createEnv(),
    requestId: "request-id",
    reply: vi.fn(),
    ...overrides,
  } as unknown as BotContext;
}

describe("diagnosisCommand", () => {
  it("rejects non-admin users", async () => {
    const ctx = createMockContext({ isAdmin: false });

    await diagnosisCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      "This command is only available to admins.",
    );
  });

  it("reports valid environment without leaking secret values", async () => {
    const ctx = createMockContext();

    await diagnosisCommand(ctx);

    const replyText = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(replyText).toContain("环境变量自检：通过");
    expect(replyText).toContain("[OK] ENCRYPTION_KEY");
    expect(replyText).toContain("[OK] SUBSCRIPTION_KV");
    expect(replyText).not.toContain("bot-token");
    expect(replyText).not.toContain("webhook-secret");
    expect(replyText).not.toContain(VALID_KEY);
    expect(replyText).not.toContain("hash-secret");
    expect(replyText).not.toContain("123456");
  });
});

describe("buildDiagnosisChecks", () => {
  it("marks invalid required configuration as errors", () => {
    const checks = buildDiagnosisChecks({
      BOT_TOKEN: "",
      TELEGRAM_WEBHOOK_SECRET: "",
      ENCRYPTION_KEY: "not-a-valid-master-key",
      USER_HASH_SECRET: "",
      ADMIN_USER_ID: "abc",
      SUBSCRIPTION_KV: {} as KVNamespace,
      APP_ENV: "staging",
      REMINDER_DAYS_AHEAD: "3.5",
    });

    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "BOT_TOKEN", level: "error" }),
        expect.objectContaining({
          name: "TELEGRAM_WEBHOOK_SECRET",
          level: "error",
        }),
        expect.objectContaining({ name: "ENCRYPTION_KEY", level: "error" }),
        expect.objectContaining({ name: "USER_HASH_SECRET", level: "error" }),
        expect.objectContaining({ name: "ADMIN_USER_ID", level: "warn" }),
        expect.objectContaining({ name: "SUBSCRIPTION_KV", level: "error" }),
        expect.objectContaining({ name: "APP_ENV", level: "error" }),
        expect.objectContaining({
          name: "REMINDER_DAYS_AHEAD",
          level: "error",
        }),
      ]),
    );
  });

  it("accepts optional defaults when unset", () => {
    const report = buildDiagnosisReport(
      createEnv({
        ADMIN_USER_ID: undefined,
        APP_ENV: undefined,
        REMINDER_DAYS_AHEAD: undefined,
      }),
    );

    expect(report).toContain("环境变量自检：通过");
    expect(report).toContain("ADMIN_USER_ID: not set");
    expect(report).toContain("APP_ENV: not set; defaults to development");
    expect(report).toContain("REMINDER_DAYS_AHEAD: not set; defaults to 3");
  });
});
