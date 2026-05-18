import type { BillingCycle, Subscription } from "../models/subscription.js";
import { addDays, addMonths, addYears } from "../utils/date.js";
import { formatMoney } from "../utils/money.js";

export const REPORT_BASE_CURRENCY = "CNY";

export interface ExchangeRateConfig {
  base: typeof REPORT_BASE_CURRENCY;
  rates: Record<string, number>;
}

export interface ReportCurrencySummary {
  currency: string;
  total: number;
  convertedTotal?: number;
  subscriptionCount: number;
}

export interface ReportDayDistribution {
  day: number;
  convertedTotal: number;
}

export interface ReportExcludedCounts {
  noPrice: number;
  noCurrency: number;
  customCycle: number;
}

export interface ReportData {
  title: string;
  totalLabel: string;
  chartTitle: string;
  chartSubtitle: string;
  generatedAt: string;
  baseCurrency: typeof REPORT_BASE_CURRENCY;
  subscriptionCount: number;
  includedCount: number;
  convertedCount: number;
  totalBase: number;
  byCurrency: ReportCurrencySummary[];
  dayDistribution: ReportDayDistribution[];
  missingRateCurrencies: string[];
  excluded: ReportExcludedCounts;
}

export interface SplitReportData {
  generatedAt: string;
  baseCurrency: typeof REPORT_BASE_CURRENCY;
  subscriptionCount: number;
  currentMonthly: ReportData;
  currentMonthDue: ReportData;
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
): SplitReportData {
  const generatedAt = now.toISOString();
  const currentMonthly = buildReportView({
    title: "当前月度支出",
    totalLabel: "月度等值支出",
    chartTitle: "扣款日分布",
    chartSubtitle: "按次扣款日汇总的月度等值支出",
    subscriptions,
    exchangeRates,
    now,
    amountForSubscription: monthlyAmountIfCurrentlyActive,
  });
  const currentMonthDue = buildReportView({
    title: "当月支出",
    totalLabel: "本月实际扣款",
    chartTitle: "本月扣款日分布",
    chartSubtitle: "按本月扣款日汇总的实际扣款金额",
    subscriptions,
    exchangeRates,
    now,
    amountForSubscription: actualAmountIfDueThisMonth,
  });

  return {
    generatedAt,
    baseCurrency: REPORT_BASE_CURRENCY,
    subscriptionCount: subscriptions.length,
    currentMonthly,
    currentMonthDue,
  };
}

interface BuildReportViewOptions {
  title: string;
  totalLabel: string;
  chartTitle: string;
  chartSubtitle: string;
  subscriptions: Subscription[];
  exchangeRates: ExchangeRateConfig | null;
  now: Date;
  amountForSubscription: (sub: Subscription, today: string) => number | null;
}

function buildReportView({
  title,
  totalLabel,
  chartTitle,
  chartSubtitle,
  subscriptions,
  exchangeRates,
  now,
  amountForSubscription,
}: BuildReportViewOptions): ReportData {
  const today = now.toISOString().slice(0, 10);
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
  let totalBase = 0;

  for (const sub of subscriptions) {
    if (sub.price === undefined) {
      excluded.noPrice += 1;
      continue;
    }
    if (!sub.currency) {
      excluded.noCurrency += 1;
      continue;
    }

    if (sub.billingCycle === "custom") {
      excluded.customCycle += 1;
      continue;
    }

    const amount = amountForSubscription(sub, today);
    if (amount === null) {
      continue;
    }

    includedCount += 1;

    const currency = sub.currency.toUpperCase();
    const summary = byCurrency.get(currency) ?? {
      currency,
      total: 0,
      convertedTotal: undefined,
      subscriptionCount: 0,
    };
    summary.total += amount;
    summary.subscriptionCount += 1;

    const rate = exchangeRates?.rates[currency];
    if (rate === undefined) {
      missingRateCurrencies.add(currency);
    } else {
      const converted = amount * rate;
      summary.convertedTotal = (summary.convertedTotal ?? 0) + converted;
      totalBase += converted;
      convertedCount += 1;

      const day = getBillingDay(sub.nextBillingDate);
      distribution.set(day, (distribution.get(day) ?? 0) + converted);
    }

    byCurrency.set(currency, summary);
  }

  return {
    title,
    totalLabel,
    chartTitle,
    chartSubtitle,
    generatedAt: now.toISOString(),
    baseCurrency: REPORT_BASE_CURRENCY,
    subscriptionCount: subscriptions.length,
    includedCount,
    convertedCount,
    totalBase,
    byCurrency: Array.from(byCurrency.values()).sort((a, b) =>
      a.currency.localeCompare(b.currency),
    ),
    dayDistribution: Array.from(distribution.entries())
      .map(([day, convertedTotal]) => ({ day, convertedTotal }))
      .sort((a, b) => a.day - b.day),
    missingRateCurrencies: Array.from(missingRateCurrencies).sort(),
    excluded,
  };
}

export function formatReportText(report: SplitReportData): string {
  const lines = ["订阅支出报告", `生成日期：${report.generatedAt.slice(0, 10)}`];

  appendReportSection(lines, report.currentMonthly);
  appendReportSection(lines, report.currentMonthDue);

  return lines.join("\n");
}

function appendReportSection(lines: string[], report: ReportData): void {
  lines.push(
    "",
    report.title,
    `${report.totalLabel}：${formatMoney(report.totalBase, report.baseCurrency)}`,
    `纳入统计：${report.includedCount}`,
  );

  if (report.byCurrency.length > 0) {
    lines.push("", "按币种：");
    for (const summary of report.byCurrency) {
      const converted =
        summary.convertedTotal !== undefined
          ? `（约 ${formatMoney(summary.convertedTotal, report.baseCurrency)}）`
          : "（缺少汇率）";
      lines.push(
        `- ${summary.currency}：${formatMoney(summary.total, summary.currency)} ${converted}`,
      );
    }
  }

  if (report.dayDistribution.length > 0) {
    lines.push("", "按扣款日分布：");
    for (const item of report.dayDistribution) {
      lines.push(
        `- ${String(item.day).padStart(2, "0")} 日：${formatMoney(
          item.convertedTotal,
          report.baseCurrency,
        )}`,
      );
    }
  }
}

function monthlyEquivalent(price: number, cycle: BillingCycle): number | null {
  if (cycle === "monthly") return price;
  if (cycle === "yearly") return price / 12;
  if (cycle === "quarterly") return price / 3;
  if (cycle === "weekly") return (price * 52) / 12;
  return null;
}

function monthlyAmountIfCurrentlyActive(
  sub: Subscription,
  today: string,
): number | null {
  if (!isWithinActiveWindow(sub.nextBillingDate, sub.billingCycle, today)) {
    return null;
  }
  return monthlyEquivalent(sub.price ?? 0, sub.billingCycle);
}

function actualAmountIfDueThisMonth(
  sub: Subscription,
  today: string,
): number | null {
  return isInCurrentMonth(sub.nextBillingDate, today) ? (sub.price ?? 0) : null;
}

function isWithinActiveWindow(
  nextBillingDate: string,
  cycle: BillingCycle,
  today: string,
): boolean {
  if (nextBillingDate < today) return false;

  let windowEnd: string;
  if (cycle === "weekly") windowEnd = addDays(today, 7);
  else if (cycle === "monthly") windowEnd = addMonths(today, 1);
  else if (cycle === "quarterly") windowEnd = addMonths(today, 3);
  else if (cycle === "yearly") windowEnd = addYears(today, 1);
  else return false;

  return nextBillingDate <= windowEnd;
}

function isInCurrentMonth(nextBillingDate: string, today: string): boolean {
  return nextBillingDate.slice(0, 7) === today.slice(0, 7);
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
