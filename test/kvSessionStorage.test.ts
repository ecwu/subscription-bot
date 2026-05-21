import { describe, it, expect } from "vitest";
import { KvSessionStorage } from "../src/bot/session/kvSessionStorage.js";

const VALID_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString(
  "base64url",
);

function createMockKV(): KVNamespace {
  const store = new Map<string, { value: string; ttl?: number }>();

  return {
    get: async (key: string) => store.get(key)?.value ?? null,
    put: async (
      key: string,
      value: string,
      options?: { expirationTtl?: number },
    ) => {
      store.set(key, { value, ttl: options?.expirationTtl });
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    list: async () => ({ keys: [], list_complete: true, cursor: "" }),
    // Expose internal store for test assertions
    _store: store,
  } as unknown as KVNamespace;
}

describe("KvSessionStorage", () => {
  it("reads missing session as undefined", async () => {
    const kv = createMockKV();
    const storage = new KvSessionStorage(kv, VALID_KEY);

    const result = await storage.read("user-key");
    expect(result).toBeUndefined();
  });

  it("writes encrypted payload with expirationTtl: 3600", async () => {
    const kv = createMockKV();
    const storage = new KvSessionStorage(kv, VALID_KEY);

    const data = { someField: "value" };
    await storage.write("user-key", data);

    // Verify raw stored value is encrypted (not plain JSON)
    const raw = await kv.get("session:user-key");
    expect(raw).not.toBeNull();
    expect(() => JSON.parse(raw!)).toThrow();

    // Verify TTL is exactly 3600 seconds
    const store = (kv as any)._store as Map<
      string,
      { value: string; ttl?: number }
    >;
    const entry = store.get("session:user-key");
    expect(entry).toBeDefined();
    expect(entry!.ttl).toBe(3600);
  });

  it("decrypts and returns stored session data", async () => {
    const kv = createMockKV();
    const storage = new KvSessionStorage(kv, VALID_KEY);

    const data = { step: 3, name: "Netflix" };
    await storage.write("user-key", data);

    const result = await storage.read("user-key");
    expect(result).toEqual(data);
  });

  it("deletes the session key", async () => {
    const kv = createMockKV();
    const storage = new KvSessionStorage(kv, VALID_KEY);

    await storage.write("user-key", { step: 1 });
    expect(await storage.read("user-key")).toBeDefined();

    await storage.delete("user-key");
    expect(await storage.read("user-key")).toBeUndefined();
  });

  it("treats corrupt data as missing", async () => {
    const kv = createMockKV();
    const storage = new KvSessionStorage(kv, VALID_KEY);

    // Manually put invalid data
    await kv.put("session:user-key", "invalid.encrypted.payload");

    const result = await storage.read("user-key");
    expect(result).toBeUndefined();
  });

  it("treats decryption-failed data as missing", async () => {
    const kv = createMockKV();
    const storage = new KvSessionStorage(kv, VALID_KEY);

    // Put valid-looking base64 but wrong ciphertext
    await kv.put(
      "session:user-key",
      "abc123.def456", // iv and ciphertext that won't decrypt
    );

    const result = await storage.read("user-key");
    expect(result).toBeUndefined();
  });

  it("survives a fresh adapter instance reading back", async () => {
    const kv = createMockKV();
    const storage1 = new KvSessionStorage(kv, VALID_KEY);

    const data = { conversationState: "waiting_for_price" };
    await storage1.write("user-key", data);

    // Fresh adapter instance
    const storage2 = new KvSessionStorage(kv, VALID_KEY);
    const result = await storage2.read("user-key");
    expect(result).toEqual(data);
  });

  it("isolates per-user encryption: user-b cannot read user-a's session", async () => {
    const kv = createMockKV();
    const storage = new KvSessionStorage(kv, VALID_KEY);

    const data = { step: 1, name: "Netflix" };
    await storage.write("user-a", data);

    // user-b reading user-a's key should get undefined (different derived key)
    const result = await storage.read("user-b");
    expect(result).toBeUndefined();
  });

  it("produces different ciphertext for identical data under different keys", async () => {
    const kv = createMockKV();
    const storage = new KvSessionStorage(kv, VALID_KEY);

    const data = { step: 1 };
    await storage.write("user-a", data);
    await storage.write("user-b", data);

    const store = (kv as any)._store as Map<string, { value: string }>;
    const cipherA = store.get("session:user-a")!.value;
    const cipherB = store.get("session:user-b")!.value;

    expect(cipherA).not.toBe(cipherB);
  });
});
