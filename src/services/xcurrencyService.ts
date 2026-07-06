import {
  EXCHANGE_RATE_BASE_CURRENCY,
  type ExchangeRateConfig,
} from "./reportService.js";

const XCURRENCY_LATEST_URL = "https://api.xcurrency.com/rate/mid/latest";

type Fetcher = typeof fetch;

interface XCurrencyLatestResponse {
  success?: unknown;
  timestamp?: unknown;
  rates?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCurrencyCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

export interface FetchXCurrencyExchangeRatesResult {
  exchangeRates: ExchangeRateConfig;
  timestamp: number;
  currencyCount: number;
}

export async function fetchXCurrencyExchangeRates(
  apiKey: string,
  fetcher: Fetcher = fetch,
): Promise<FetchXCurrencyExchangeRatesResult> {
  const url = new URL(XCURRENCY_LATEST_URL);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("quote", EXCHANGE_RATE_BASE_CURRENCY);
  url.searchParams.set("category", "currency");

  const response = await fetcher(url.toString(), {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`XCurrency request failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as XCurrencyLatestResponse;
  if (payload.success !== true || !isRecord(payload.rates)) {
    throw new Error("XCurrency response is missing successful rates data");
  }

  if (
    typeof payload.timestamp !== "number" ||
    !Number.isFinite(payload.timestamp)
  ) {
    throw new Error("XCurrency response is missing a valid timestamp");
  }

  const rates: Record<string, number> = { [EXCHANGE_RATE_BASE_CURRENCY]: 1 };
  for (const [currency, rawRate] of Object.entries(payload.rates)) {
    const normalized = currency.toUpperCase();
    if (!isCurrencyCode(normalized)) continue;
    if (normalized === EXCHANGE_RATE_BASE_CURRENCY) continue;
    if (
      typeof rawRate !== "number" ||
      !Number.isFinite(rawRate) ||
      rawRate <= 0
    ) {
      throw new Error("XCurrency response contains an invalid rate");
    }

    rates[normalized] = 1 / rawRate;
  }

  return {
    exchangeRates: {
      base: EXCHANGE_RATE_BASE_CURRENCY,
      rates,
    },
    timestamp: payload.timestamp,
    currencyCount: Object.keys(rates).length,
  };
}
