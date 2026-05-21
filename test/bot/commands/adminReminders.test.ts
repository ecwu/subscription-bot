import { describe, it, expect } from "vitest";
import { adminRemindersCommand } from "../../../src/bot/commands/adminReminders.js";
import { createUserRepository } from "../../../src/repositories/userRepository.js";
import type { KVNamespace } from "@cloudflare/workers-types";
import type { BotContext } from "../../../src/types/context.js";

const VALID_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString(
  "base64url",
);

function createMockKV(store: Map<string, string>): KVNamespace {
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

function mockCtx(
  props: {
    isAdmin?: boolean;
    store?: Map<string, string>;
    replies?: string[];
    userKey?: string;
  } = {},
): BotContext {
  const replies: string[] = props.replies ?? [];
  const store = props.store ?? new Map<string, string>();
  return {
    isAdmin: props.isAdmin ?? false,
    userKey: props.userKey,
    env: {
      SUBSCRIPTION_KV: createMockKV(store),
      ENCRYPTION_KEY: VALID_KEY,
    },
    requestId: "request-id",
    reply: async (text: string) => {
      replies.push(text);
    },
  } as unknown as BotContext;
}

describe("adminRemindersCommand", () => {
  it("rejects non-admin users", async () => {
    const replies: string[] = [];
    const ctx = mockCtx({ isAdmin: false, replies });
    await adminRemindersCommand(ctx);
    expect(replies[0]).toContain("only available to admins");
  });

  it("reports no data when KV is empty", async () => {
    const replies: string[] = [];
    const ctx = mockCtx({ isAdmin: true, replies });
    await adminRemindersCommand(ctx);
    expect(replies[0]).toContain("No upcoming reminder data found");
  });

  it("counts users by timezone", async () => {
    const replies: string[] = [];
    const store = new Map<string, string>();

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const d = `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, "0")}-${String(tomorrow.getUTCDate()).padStart(2, "0")}`;

    store.set(
      `reminders:date:${d}`,
      JSON.stringify([
        { userKey: "user-a", subscriptionId: "sub-1" },
        { userKey: "user-b", subscriptionId: "sub-2" },
        { userKey: "user-c", subscriptionId: "sub-3" },
      ]),
    );

    const repo = createUserRepository(createMockKV(store));

    await repo.updateUserSettings(
      "user-a",
      {
        defaultCurrency: "USD",
        reminderEnabled: true,
        reminderHour: 9,
        timezone: "Asia/Shanghai",
      },
      VALID_KEY,
    );
    await repo.updateUserSettings(
      "user-b",
      {
        defaultCurrency: "USD",
        reminderEnabled: true,
        reminderHour: 10,
        timezone: "UTC+08:00",
      },
      VALID_KEY,
    );
    await repo.updateUserSettings(
      "user-c",
      {
        defaultCurrency: "USD",
        reminderEnabled: false,
        reminderHour: 9,
        timezone: "America/New_York",
      },
      VALID_KEY,
    );

    const ctx = mockCtx({ isAdmin: true, replies, store });
    await adminRemindersCommand(ctx);

    const output = replies[0];
    expect(output).toContain("User Reminder Timezone Distribution");
    expect(output).toContain("reminders enabled: 2");
    expect(output).toContain("Asia/Shanghai");
    expect(output).toContain("UTC+08:00");
    expect(output).not.toContain("America/New_York");
  });
});
