import { describe, it, expect } from "vitest";
import { requestContext } from "../src/bot/middleware/requestContext.js";
import type { BotContext } from "../src/types/context.js";
import type { Env } from "../src/types/env.js";
import { createUserRepository } from "../src/repositories/userRepository.js";

const VALID_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString(
  "base64url"
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
    list: async (options?: { prefix?: string; limit?: number; cursor?: string }) => {
      const prefix = options?.prefix ?? "";
      const keys = Array.from(store.keys())
        .filter((k) => k.startsWith(prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true, cursor: "" };
    },
  } as unknown as KVNamespace;
}

function createMockEnv(overrides: Partial<Env> = {}): Env {
  return {
    BOT_TOKEN: "test-token",
    TELEGRAM_WEBHOOK_SECRET: "test-secret",
    ENCRYPTION_KEY: VALID_KEY,
    USER_HASH_SECRET: "test-hash-secret",
    SUBSCRIPTION_KV: createMockKV(),
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
      logs.push(
        args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")
      );
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

  it("upserts user profile when userKey and chat.id are present", async () => {
    const env = createMockEnv();
    const ctx = createMockContext({
      from: { id: 12345, is_bot: false, first_name: "Test" },
      chat: { id: 987654321, type: "private" },
    });

    const middleware = requestContext(env);
    await middleware(ctx, async () => {
      // no-op
    });

    const userRepo = createUserRepository(env.SUBSCRIPTION_KV);
    const profile = await userRepo.getUserProfile(ctx.userKey!, VALID_KEY);

    expect(profile).not.toBeNull();
    expect(profile?.chatId).toBe(987654321);
  });

  it("does not break when chat.id is missing", async () => {
    const env = createMockEnv();
    const ctx = createMockContext({
      from: { id: 12345, is_bot: false, first_name: "Test" },
      chat: undefined,
    });

    const middleware = requestContext(env);
    let nextCalled = false;
    await expect(
      middleware(ctx, async () => {
        nextCalled = true;
      })
    ).resolves.not.toThrow();

    expect(nextCalled).toBe(true);
  });

  it("does not log raw chat_id", async () => {
    const env = createMockEnv();
    const ctx = createMockContext({
      from: { id: 12345, is_bot: false, first_name: "Test" },
      chat: { id: 987654321, type: "private" },
    });

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(
        args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")
      );
    };

    try {
      const middleware = requestContext(env);
      await middleware(ctx, async () => {
        // no-op
      });
    } finally {
      console.log = originalLog;
    }

    const allLogs = logs.join(" ");
    expect(allLogs).not.toContain("987654321");
  });
});
