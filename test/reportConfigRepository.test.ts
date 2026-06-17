import { describe, it, expect } from "vitest";
import type { KVNamespace } from "@cloudflare/workers-types";
import {
  createReportConfigRepository,
  EXCHANGE_RATES_CONFIG_KEY,
} from "../src/repositories/reportConfigRepository.js";

function createMockKV(initial: Record<string, string> = {}): KVNamespace {
  const store = new Map<string, string>(Object.entries(initial));

  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
  } as unknown as KVNamespace;
}

describe("reportConfigRepository", () => {
  it("loads exchange rates from the fixed KV key", async () => {
    const kv = createMockKV({
      [EXCHANGE_RATES_CONFIG_KEY]: JSON.stringify({
        base: "USD",
        rates: { USD: 1, CNY: 7.2 },
      }),
    });

    const repo = createReportConfigRepository(kv);

    await expect(repo.getExchangeRates()).resolves.toEqual({
      base: "USD",
      rates: { USD: 1, CNY: 7.2 },
    });
  });

  it("returns null when the config is missing", async () => {
    const repo = createReportConfigRepository(createMockKV());

    await expect(repo.getExchangeRates()).resolves.toBeNull();
  });

  it("returns null for invalid config", async () => {
    const kv = createMockKV({
      [EXCHANGE_RATES_CONFIG_KEY]: JSON.stringify({
        base: "CNY",
        rates: { CNY: 1, USD: 1 },
      }),
    });

    const repo = createReportConfigRepository(kv);

    await expect(repo.getExchangeRates()).resolves.toBeNull();
  });
});
