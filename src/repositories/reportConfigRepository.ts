import type { KVNamespace } from "@cloudflare/workers-types";
import {
  type ExchangeRateConfig,
  parseExchangeRateConfig,
} from "../services/reportService.js";

export const EXCHANGE_RATES_CONFIG_KEY = "config:exchange-rates:v1";

export interface ReportConfigRepository {
  getExchangeRates(): Promise<ExchangeRateConfig | null>;
}

export function createReportConfigRepository(
  kv: KVNamespace,
): ReportConfigRepository {
  return {
    async getExchangeRates(): Promise<ExchangeRateConfig | null> {
      const raw = await kv.get(EXCHANGE_RATES_CONFIG_KEY);
      return parseExchangeRateConfig(raw);
    },
  };
}
