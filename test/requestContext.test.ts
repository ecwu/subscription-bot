import { describe, it, expect } from "vitest";
import { requestContext } from "../src/bot/middleware/requestContext.js";
import type { BotContext } from "../src/types/context.js";
import type { Env } from "../src/types/env.js";

function createMockEnv(overrides: Partial<Env> = {}): Env {
  return {
    BOT_TOKEN: "test-token",
    TELEGRAM_WEBHOOK_SECRET: "test-secret",
    ENCRYPTION_KEY: Buffer.from("0123456789abcdef0123456789abcdef")
      .toString("base64url"),
    USER_HASH_SECRET: "test-hash-secret",
    SUBSCRIPTION_KV: {} as KVNamespace,
    ...overrides,
  };
}

function createMockContext(partial: Partial<BotContext> = {}): BotContext {
  return {
    update: { update_id: 1 },
    from: undefined,
    ...partial,
  } as unknown as BotContext;
}

describe("requestContext", () => {
  it("sets env, requestId, and userKey when from.id exists", async () => {
    const env = createMockEnv();
    const ctx = createMockContext({
      from: { id: 12345, is_bot: false, first_name: "Test" },
    });

    const middleware = requestContext(env);
    let nextCalled = false;
    await middleware(ctx, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(ctx.env).toBe(env);
    expect(ctx.requestId).toBeDefined();
    expect(typeof ctx.requestId).toBe("string");
    expect(ctx.userKey).toBeDefined();
    expect(typeof ctx.userKey).toBe("string");
    // HMAC-SHA-256 is 32 bytes, base64url-encoded to 43 characters
    expect(ctx.userKey).toHaveLength(43);
  });

  it("leaves userKey undefined when from is missing", async () => {
    const env = createMockEnv();
    const ctx = createMockContext();

    const middleware = requestContext(env);
    let nextCalled = false;
    await middleware(ctx, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(ctx.userKey).toBeUndefined();
    expect(ctx.requestId).toBeDefined();
  });

  it("leaves userKey undefined when USER_HASH_SECRET is empty", async () => {
    const env = createMockEnv({ USER_HASH_SECRET: "" });
    const ctx = createMockContext({
      from: { id: 12345, is_bot: false, first_name: "Test" },
    });

    const middleware = requestContext(env);
    let nextCalled = false;
    await middleware(ctx, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(ctx.userKey).toBeUndefined();
  });

  it("does not throw when hashUserId fails", async () => {
    const env = createMockEnv({ USER_HASH_SECRET: "" });
    const ctx = createMockContext({
      from: { id: 12345, is_bot: false, first_name: "Test" },
    });

    const middleware = requestContext(env);
    let nextCalled = false;
    await expect(
      middleware(ctx, async () => {
        nextCalled = true;
      })
    ).resolves.not.toThrow();

    expect(nextCalled).toBe(true);
    expect(ctx.userKey).toBeUndefined();
  });

  it("logs safe diagnostics without raw IDs or secrets", async () => {
    const env = createMockEnv();
    const ctx = createMockContext({
      from: { id: 12345, is_bot: false, first_name: "Test" },
    });

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    };

    try {
      const middleware = requestContext(env);
      await middleware(ctx, async () => {
        // no-op
      });
    } finally {
      console.log = originalLog;
    }

    const diagnosticLog = logs.find((l) => l.includes("request_context_user_key"));
    expect(diagnosticLog).toBeDefined();

    // Ensure no raw IDs or secrets are in the log
    expect(diagnosticLog).not.toContain("12345");
    expect(diagnosticLog).not.toContain("test-hash-secret");
    expect(diagnosticLog).not.toContain(ctx.userKey as string);

    // Ensure booleans are present
    expect(diagnosticLog).toContain('"hasFrom":true');
    expect(diagnosticLog).toContain('"hasUserHashSecret":true');
    expect(diagnosticLog).toContain('"hasUserKey":true');
  });
});
