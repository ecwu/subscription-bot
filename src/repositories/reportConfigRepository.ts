import type { KVNamespace } from "@cloudflare/workers-types";
import {
  type ExchangeRateConfig,
  parseExchangeRateConfig,
} from "../services/reportService.js";

export const EXCHANGE_RATES_CONFIG_KEY = "config:exchange-rates:v1";
export const XCURRENCY_EXCHANGE_RATES_CONFIG_KEY =
  "config:exchange-rates:xcurrency:v1";

export interface ReportConfigRepository {
  getExchangeRates(): Promise<ExchangeRateConfig | null>;
  putXCurrencyExchangeRates(config: ExchangeRateConfig): Promise<void>;
}

export function createReportConfigRepository(
  kv: KVNamespace,
): ReportConfigRepository {
  return {
    async getExchangeRates(): Promise<ExchangeRateConfig | null> {
      const xcurrencyRaw = await kv.get(XCURRENCY_EXCHANGE_RATES_CONFIG_KEY);
      const xcurrencyRates = parseExchangeRateConfig(xcurrencyRaw);
      if (xcurrencyRates) return xcurrencyRates;

      const manualRaw = await kv.get(EXCHANGE_RATES_CONFIG_KEY);
      return parseExchangeRateConfig(manualRaw);
    },

    async putXCurrencyExchangeRates(config: ExchangeRateConfig): Promise<void> {
      await kv.put(XCURRENCY_EXCHANGE_RATES_CONFIG_KEY, JSON.stringify(config));
    },
  };
}
