import { describe, it, expect, vi } from "vitest";
import { requestContext } from "../src/bot/middleware/requestContext.js";
import type { BotContext } from "../src/types/context.js";
import type { Env } from "../src/types/env.js";
import { createUserRepository } from "../src/repositories/userRepository.js";
import { decrypt, parseEncryptedPayload } from "../src/crypto/encryption.js";
import { userProfile } from "../src/utils/kvKeys.js";

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

function createFailingKV(
  fail: (operation: "get" | "put", key: string) => boolean,
): KVNamespace {
  const store = new Map<string, string>();

  return {
    get: async (key: string) => {
      if (fail("get", key)) {
        throw new Error("KV get failed");
      }
      return store.get(key) ?? null;
    },
    put: async (key: string, value: string) => {
      if (fail("put", key)) {
        throw new Error("KV put failed");
      }
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
      }),
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
        args
          .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
          .join(" "),
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

    const diagnosticLog = logs.find((l) =>
      l.includes("request_context_user_key"),
    );
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

    const stored = await env.SUBSCRIPTION_KV.get(userProfile(ctx.userKey!));
    expect(stored).not.toBeNull();
    const encryptedPayload = JSON.parse(stored as string).encryptedPayload;
    await expect(
      decrypt(parseEncryptedPayload(encryptedPayload), VALID_KEY),
    ).rejects.toThrow();
  });

  it("does not upsert user profile again when profile is fresh and chat.id is unchanged", async () => {
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
    const first = await userRepo.getUserProfile(ctx.userKey!, VALID_KEY);

    await new Promise((r) => setTimeout(r, 10));
    await middleware(ctx, async () => {
      // no-op
    });

    const second = await userRepo.getUserProfile(ctx.userKey!, VALID_KEY);
    expect(second?.lastSeenAt).toBe(first?.lastSeenAt);
  });

  it("upserts user profile when chat.id changes", async () => {
    const env = createMockEnv();
    const ctx = createMockContext({
      from: { id: 12345, is_bot: false, first_name: "Test" },
      chat: { id: 987654321, type: "private" },
    });

    const middleware = requestContext(env);
    await middleware(ctx, async () => {
      // no-op
    });

    ctx.chat = { id: 123456789, type: "private" } as BotContext["chat"];
    await middleware(ctx, async () => {
      // no-op
    });

    const userRepo = createUserRepository(env.SUBSCRIPTION_KV);
    const profile = await userRepo.getUserProfile(ctx.userKey!, VALID_KEY);
    expect(profile?.chatId).toBe(123456789);
  });

  it("does not upsert deleted users and hides userKey outside /start", async () => {
    const env = createMockEnv();
    const userRepo = createUserRepository(env.SUBSCRIPTION_KV);
    const markerCtx = createMockContext({
      from: { id: 12345, is_bot: false, first_name: "Test" },
      chat: { id: 987654321, type: "private" },
      message: { text: "/noop" },
    });

    const middleware = requestContext(env);
    await middleware(markerCtx, async () => {
      await userRepo.markUserDeleted(markerCtx.userKey!);
    });
    await userRepo.deleteUserProfile(markerCtx.userKey!);

    const deletedCtx = createMockContext({
      from: { id: 12345, is_bot: false, first_name: "Test" },
      chat: { id: 987654321, type: "private" },
      message: { text: "/add" },
    });

    await middleware(deletedCtx, async () => {
      // no-op
    });

    expect(deletedCtx.userKey).toBeUndefined();
    expect(
      await userRepo.getUserProfile(markerCtx.userKey!, VALID_KEY),
    ).toBeNull();
  });

  it("hides userKey outside /start when deleted marker lookup fails", async () => {
    const env = createMockEnv({
      SUBSCRIPTION_KV: createFailingKV(
        (operation, key) => operation === "get" && key.endsWith(":deleted"),
      ),
    });
    const ctx = createMockContext({
      from: { id: 12345, is_bot: false, first_name: "Test" },
      chat: { id: 987654321, type: "private" },
      message: { text: "/add" },
    });

    const middleware = requestContext(env);
    let nextCalled = false;
    await expect(
      middleware(ctx, async () => {
        nextCalled = true;
      }),
    ).resolves.not.toThrow();

    expect(nextCalled).toBe(true);
    expect(ctx.userKey).toBeUndefined();
  });

  it("keeps userKey on /start when deleted marker lookup fails", async () => {
    const env = createMockEnv({
      SUBSCRIPTION_KV: createFailingKV(
        (operation, key) => operation === "get" && key.endsWith(":deleted"),
      ),
    });
    const ctx = createMockContext({
      from: { id: 12345, is_bot: false, first_name: "Test" },
      chat: { id: 987654321, type: "private" },
      message: { text: "/start" },
    });

    const middleware = requestContext(env);
    let nextCalled = false;
    await expect(
      middleware(ctx, async () => {
        nextCalled = true;
      }),
    ).resolves.not.toThrow();

    expect(nextCalled).toBe(true);
    expect(ctx.userKey).toBeDefined();
  });

  it("continues when user profile read fails", async () => {
    const env = createMockEnv({
      SUBSCRIPTION_KV: createFailingKV(
        (operation, key) => operation === "get" && key.endsWith(":profile"),
      ),
    });
    const ctx = createMockContext({
      from: { id: 12345, is_bot: false, first_name: "Test" },
      chat: { id: 987654321, type: "private" },
    });

    const middleware = requestContext(env);
    let nextCalled = false;
    await expect(
      middleware(ctx, async () => {
        nextCalled = true;
      }),
    ).resolves.not.toThrow();

    expect(nextCalled).toBe(true);
    expect(ctx.userKey).toBeDefined();
  });

  it("continues when user profile upsert fails", async () => {
    const env = createMockEnv({
      SUBSCRIPTION_KV: createFailingKV(
        (operation, key) => operation === "put" && key.endsWith(":profile"),
      ),
    });
    const ctx = createMockContext({
      from: { id: 12345, is_bot: false, first_name: "Test" },
      chat: { id: 987654321, type: "private" },
    });

    const middleware = requestContext(env);
    let nextCalled = false;
    await expect(
      middleware(ctx, async () => {
        nextCalled = true;
      }),
    ).resolves.not.toThrow();

    expect(nextCalled).toBe(true);
    expect(ctx.userKey).toBeDefined();
  });

  it("upserts user profile when lastSeenAt is older than 24 hours", async () => {
    vi.useFakeTimers();
    try {
      const env = createMockEnv();
      const ctx = createMockContext({
        from: { id: 12345, is_bot: false, first_name: "Test" },
        chat: { id: 987654321, type: "private" },
      });
      const middleware = requestContext(env);

      vi.setSystemTime(new Date("2026-07-01T00:00:00.000Z"));
      await middleware(ctx, async () => {
        // no-op
      });

      const userRepo = createUserRepository(env.SUBSCRIPTION_KV);
      const first = await userRepo.getUserProfile(ctx.userKey!, VALID_KEY);

      vi.setSystemTime(new Date("2026-07-02T00:00:00.000Z"));
      await middleware(ctx, async () => {
        // no-op
      });

      const second = await userRepo.getUserProfile(ctx.userKey!, VALID_KEY);
      expect(second?.lastSeenAt).not.toBe(first?.lastSeenAt);
      expect(second?.lastSeenAt).toBe("2026-07-02T00:00:00.000Z");
    } finally {
      vi.useRealTimers();
    }
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
      }),
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
        args
          .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
          .join(" "),
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
