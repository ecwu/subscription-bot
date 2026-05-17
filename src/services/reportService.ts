import type { BillingCycle, Subscription } from "../models/subscription.js";
import { formatMoney } from "../utils/money.js";

export const REPORT_BASE_CURRENCY = "CNY";

export interface ExchangeRateConfig {
  base: typeof REPORT_BASE_CURRENCY;
  rates: Record<string, number>;
}

export interface ReportCurrencySummary {
  currency: string;
  monthlyTotal: number;
  convertedMonthlyTotal?: number;
  subscriptionCount: number;
}

export interface ReportDayDistribution {
  day: number;
  convertedMonthlyTotal: number;
}

export interface ReportExcludedCounts {
  noPrice: number;
  noCurrency: number;
  customCycle: number;
}

export interface ReportData {
  generatedAt: string;
  baseCurrency: typeof REPORT_BASE_CURRENCY;
  subscriptionCount: number;
  includedCount: number;
  convertedCount: number;
  monthlyTotalBase: number;
  byCurrency: ReportCurrencySummary[];
  dayDistribution: ReportDayDistribution[];
  missingRateCurrencies: string[];
  excluded: ReportExcludedCounts;
}

export function parseExchangeRateConfig(
  input: string | null,
): ExchangeRateConfig | null {
  if (!input) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (parsed.base !== REPORT_BASE_CURRENCY) return null;
  if (!isRecord(parsed.rates)) return null;

  const rates: Record<string, number> = {};
  for (const [currency, value] of Object.entries(parsed.rates)) {
    const normalized = currency.toUpperCase();
    if (!isValidCurrency(normalized)) return null;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      return null;
    }
    rates[normalized] = value;
  }

  if (rates[REPORT_BASE_CURRENCY] !== 1) return null;

  return {
    base: REPORT_BASE_CURRENCY,
    rates,
  };
}

export function buildReportData(
  subscriptions: Subscription[],
  exchangeRates: ExchangeRateConfig | null,
  now: Date = new Date(),
): ReportData {
  const byCurrency = new Map<string, ReportCurrencySummary>();
  const distribution = new Map<number, number>();
  const missingRateCurrencies = new Set<string>();
  const excluded: ReportExcludedCounts = {
    noPrice: 0,
    noCurrency: 0,
    customCycle: 0,
  };

  let includedCount = 0;
  let convertedCount = 0;
  let monthlyTotalBase = 0;

  for (const sub of subscriptions) {
    if (sub.price === undefined) {
      excluded.noPrice += 1;
      continue;
    }
    if (!sub.currency) {
      excluded.noCurrency += 1;
      continue;
    }

    const monthlyAmount = monthlyEquivalent(sub.price, sub.billingCycle);
    if (monthlyAmount === null) {
      excluded.customCycle += 1;
      continue;
    }

    includedCount += 1;

    const currency = sub.currency.toUpperCase();
    const summary = byCurrency.get(currency) ?? {
      currency,
      monthlyTotal: 0,
      convertedMonthlyTotal: undefined,
      subscriptionCount: 0,
    };
    summary.monthlyTotal += monthlyAmount;
    summary.subscriptionCount += 1;

    const rate = exchangeRates?.rates[currency];
    if (rate === undefined) {
      missingRateCurrencies.add(currency);
    } else {
      const converted = monthlyAmount * rate;
      summary.convertedMonthlyTotal =
        (summary.convertedMonthlyTotal ?? 0) + converted;
      monthlyTotalBase += converted;
      convertedCount += 1;

      const day = getBillingDay(sub.nextBillingDate);
      distribution.set(day, (distribution.get(day) ?? 0) + converted);
    }

    byCurrency.set(currency, summary);
  }

  return {
    generatedAt: now.toISOString(),
    baseCurrency: REPORT_BASE_CURRENCY,
    subscriptionCount: subscriptions.length,
    includedCount,
    convertedCount,
    monthlyTotalBase,
    byCurrency: Array.from(byCurrency.values()).sort((a, b) =>
      a.currency.localeCompare(b.currency),
    ),
    dayDistribution: Array.from(distribution.entries())
      .map(([day, convertedMonthlyTotal]) => ({ day, convertedMonthlyTotal }))
      .sort((a, b) => a.day - b.day),
    missingRateCurrencies: Array.from(missingRateCurrencies).sort(),
    excluded,
  };
}

export function formatReportText(report: ReportData): string {
  const lines = [
    "Subscription run-rate report",
    `Generated: ${report.generatedAt.slice(0, 10)}`,
    `Monthly total: ${formatMoney(report.monthlyTotalBase, report.baseCurrency)}`,
    `Included: ${report.includedCount}/${report.subscriptionCount}`,
  ];

  if (report.byCurrency.length > 0) {
    lines.push("", "By currency:");
    for (const summary of report.byCurrency) {
      const converted =
        summary.convertedMonthlyTotal !== undefined
          ? ` (~${formatMoney(summary.convertedMonthlyTotal, report.baseCurrency)})`
          : " (missing exchange rate)";
      lines.push(
        `- ${summary.currency}: ${formatMoney(summary.monthlyTotal, summary.currency)}${converted}`,
      );
    }
  }

  if (report.dayDistribution.length > 0) {
    lines.push("", "Monthly date distribution:");
    for (const item of report.dayDistribution) {
      lines.push(
        `- Day ${String(item.day).padStart(2, "0")}: ${formatMoney(
          item.convertedMonthlyTotal,
          report.baseCurrency,
        )}`,
      );
    }
  }

  if (report.missingRateCurrencies.length > 0) {
    lines.push(
      "",
      `Missing exchange rates: ${report.missingRateCurrencies.join(", ")}`,
    );
  }

  const excludedTotal =
    report.excluded.noPrice +
    report.excluded.noCurrency +
    report.excluded.customCycle;
  if (excludedTotal > 0) {
    lines.push(
      "",
      `Excluded: ${excludedTotal} (no price: ${report.excluded.noPrice}, no currency: ${report.excluded.noCurrency}, custom cycle: ${report.excluded.customCycle})`,
    );
  }

  return lines.join("\n");
}

function monthlyEquivalent(price: number, cycle: BillingCycle): number | null {
  if (cycle === "monthly") return price;
  if (cycle === "yearly") return price / 12;
  if (cycle === "quarterly") return price / 3;
  if (cycle === "weekly") return (price * 52) / 12;
  return null;
}

function getBillingDay(date: string): number {
  const parsed = Number(date.slice(8, 10));
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 31 ? parsed : 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidCurrency(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}
