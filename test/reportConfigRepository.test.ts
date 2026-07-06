import { describe, it, expect } from "vitest";
import type { KVNamespace } from "@cloudflare/workers-types";
import {
  createReportConfigRepository,
  EXCHANGE_RATES_CONFIG_KEY,
  XCURRENCY_EXCHANGE_RATES_CONFIG_KEY,
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

  it("prefers XCurrency exchange rates over the manual KV key", async () => {
    const kv = createMockKV({
      [EXCHANGE_RATES_CONFIG_KEY]: JSON.stringify({
        base: "USD",
        rates: { USD: 1, CNY: 7.2 },
      }),
      [XCURRENCY_EXCHANGE_RATES_CONFIG_KEY]: JSON.stringify({
        base: "USD",
        rates: { USD: 1, CNY: 7.1, EUR: 0.92 },
      }),
    });

    const repo = createReportConfigRepository(kv);

    await expect(repo.getExchangeRates()).resolves.toEqual({
      base: "USD",
      rates: { USD: 1, CNY: 7.1, EUR: 0.92 },
    });
  });

  it("falls back to manual rates when the XCurrency config is invalid", async () => {
    const kv = createMockKV({
      [EXCHANGE_RATES_CONFIG_KEY]: JSON.stringify({
        base: "USD",
        rates: { USD: 1, CNY: 7.2 },
      }),
      [XCURRENCY_EXCHANGE_RATES_CONFIG_KEY]: JSON.stringify({
        base: "EUR",
        rates: { EUR: 1 },
      }),
    });

    const repo = createReportConfigRepository(kv);

    await expect(repo.getExchangeRates()).resolves.toEqual({
      base: "USD",
      rates: { USD: 1, CNY: 7.2 },
    });
  });

  it("stores XCurrency exchange rates under the XCurrency KV key", async () => {
    const kv = createMockKV();
    const repo = createReportConfigRepository(kv);

    await repo.putXCurrencyExchangeRates({
      base: "USD",
      rates: { USD: 1, CNY: 7.1 },
    });

    await expect(kv.get(XCURRENCY_EXCHANGE_RATES_CONFIG_KEY)).resolves.toBe(
      JSON.stringify({ base: "USD", rates: { USD: 1, CNY: 7.1 } }),
    );
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
