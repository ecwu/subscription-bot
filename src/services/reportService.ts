import type { BillingCycle, Subscription } from "../models/subscription.js";
import {
  addDays,
  addMonths,
  addYears,
  getBillingAnchorDay,
  getNextBillingDate,
  getPreviousBillingDate,
} from "../utils/date.js";
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
  actualTotal: number;
  monthlyEquivalentTotal: number;
}

export interface ReportMonthDistribution {
  monthKey: string;
  actualTotal: number;
}

export interface ReportExcludedCounts {
  noPrice: number;
  noCurrency: number;
  customCycle: number;
}

export interface TextReportSubscriptionItem {
  name: string;
  amount: number;
  currency: string;
  convertedAmount?: number;
  billingDay?: number;
}

export interface TextReportMonthItems {
  monthKey: string;
  totalConverted: number;
  items: TextReportSubscriptionItem[];
}

export interface TextReportData {
  generatedAt: string;
  baseCurrency: string;
  currentMonthKey: string;
  currentMonthItems: TextReportSubscriptionItem[];
  currentMonthTotal: number;
  yearMonthItems: TextReportMonthItems[];
  yearTotal: number;
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
  monthDistribution?: ReportMonthDistribution[];
  missingRateCurrencies: string[];
  excluded: ReportExcludedCounts;
}

export interface SplitReportData {
  generatedAt: string;
  baseCurrency: typeof REPORT_BASE_CURRENCY;
  subscriptionCount: number;
  currentMonthly: ReportData;
  currentMonthDue: ReportData;
  yearlyProjection: ReportData;
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
  const dayDistribution = buildFullMonthDayDistribution(
    subscriptions,
    exchangeRates,
    now,
  );
  const currentMonthly = buildReportView({
    title: "月度摊平支出",
    totalLabel: "月度摊平支出",
    chartTitle: "月度摊平分布",
    chartSubtitle: "按扣款日汇总的月度摊平支出",
    subscriptions,
    exchangeRates,
    now,
    amountForSubscription: monthlyAmountIfCurrentlyActive,
    dayDistribution,
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
    dayDistribution,
  });

  const yearMonthDistribution = buildYearMonthDistribution(
    subscriptions,
    exchangeRates,
    now,
  );
  const yearlyProjection = buildReportView({
    title: "年度预期支出",
    totalLabel: "未来12个月预期扣款",
    chartTitle: "月度预期扣款分布",
    chartSubtitle: "按月汇总的未来12个月预期扣款金额",
    subscriptions,
    exchangeRates,
    now,
    amountForSubscription: totalProjectedInYear,
    dayDistribution: [],
  });
  yearlyProjection.monthDistribution = yearMonthDistribution;

  return {
    generatedAt,
    baseCurrency: REPORT_BASE_CURRENCY,
    subscriptionCount: subscriptions.length,
    currentMonthly,
    currentMonthDue,
    yearlyProjection,
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
  dayDistribution: ReportDayDistribution[];
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
  dayDistribution,
}: BuildReportViewOptions): ReportData {
  const today = now.toISOString().slice(0, 10);
  const byCurrency = new Map<string, ReportCurrencySummary>();
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
    if (sub.status === "paused") {
      continue;
    }

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
    dayDistribution,
    missingRateCurrencies: Array.from(missingRateCurrencies).sort(),
    excluded,
  };
}

function buildFullMonthDayDistribution(
  subscriptions: Subscription[],
  exchangeRates: ExchangeRateConfig | null,
  now: Date,
): ReportDayDistribution[] {
  const today = now.toISOString().slice(0, 10);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const daysInMonth = new Date(year, month, 0).getDate();

  const actualByDay = new Map<number, number>();
  const monthlyByDay = new Map<number, number>();

  for (const sub of subscriptions) {
    if (sub.status === "paused") continue;
    if (sub.price === undefined) continue;
    if (!sub.currency) continue;
    if (sub.billingCycle === "custom") continue;

    const currency = sub.currency.toUpperCase();
    const rate = exchangeRates?.rates[currency];
    if (rate === undefined) continue;

    const monthlyDay = getBillingDay(sub.nextBillingDate);

    const monthlyAmount = monthlyAmountIfCurrentlyActive(sub, today);
    if (monthlyAmount !== null) {
      monthlyByDay.set(
        monthlyDay,
        (monthlyByDay.get(monthlyDay) ?? 0) + monthlyAmount * rate,
      );
    }

    const actualBillingDate = findActualBillingDateForCurrentMonth(sub, today);
    if (actualBillingDate !== null) {
      const actualDay = getBillingDay(actualBillingDate);
      actualByDay.set(
        actualDay,
        (actualByDay.get(actualDay) ?? 0) + (sub.price ?? 0) * rate,
      );
    }
  }

  const distribution: ReportDayDistribution[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    distribution.push({
      day,
      actualTotal: actualByDay.get(day) ?? 0,
      monthlyEquivalentTotal: monthlyByDay.get(day) ?? 0,
    });
  }
  return distribution;
}

export function formatReportText(report: SplitReportData): string {
  const lines = [
    "订阅支出报告",
    `生成日期：${report.generatedAt.slice(0, 10)}`,
  ];

  appendReportSection(lines, report.currentMonthly);
  appendReportSection(lines, report.currentMonthDue);
  appendReportSection(lines, report.yearlyProjection);

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

  if (report.monthDistribution && report.monthDistribution.length > 0) {
    const nonZeroMonths = report.monthDistribution.filter(
      (item) => item.actualTotal > 0,
    );
    if (nonZeroMonths.length > 0) {
      lines.push("", "按月分布：");
      for (const item of nonZeroMonths) {
        lines.push(
          `- ${item.monthKey}：实际 ${formatMoney(item.actualTotal, report.baseCurrency)}`,
        );
      }
    }
  } else {
    const nonZeroDays = report.dayDistribution.filter(
      (item) => item.actualTotal > 0 || item.monthlyEquivalentTotal > 0,
    );
    if (nonZeroDays.length > 0) {
      lines.push("", "按扣款日分布：");
      for (const item of nonZeroDays) {
        const parts: string[] = [];
        if (item.actualTotal > 0) {
          parts.push(`实际 ${formatMoney(item.actualTotal, report.baseCurrency)}`);
        }
        if (item.monthlyEquivalentTotal > 0) {
          parts.push(
            `等值 ${formatMoney(item.monthlyEquivalentTotal, report.baseCurrency)}`,
          );
        }
        lines.push(
          `- ${String(item.day).padStart(2, "0")} 日：${parts.join("，")}`,
        );
      }
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

function monthlyEquivalentForSubscription(sub: Subscription): number | null {
  if (sub.billingCycle === "interval") {
    if (!sub.billingInterval) return null;
    if (sub.billingInterval.unit === "day") {
      return ((sub.price ?? 0) * 365) / sub.billingInterval.count / 12;
    }
    if (sub.billingInterval.unit === "week") {
      return ((sub.price ?? 0) * 52) / sub.billingInterval.count / 12;
    }
    if (sub.billingInterval.unit === "month") {
      return (sub.price ?? 0) / sub.billingInterval.count;
    }
    if (sub.billingInterval.unit === "year") {
      return (sub.price ?? 0) / (sub.billingInterval.count * 12);
    }
    return null;
  }

  return monthlyEquivalent(sub.price ?? 0, sub.billingCycle);
}

function monthlyAmountIfCurrentlyActive(
  sub: Subscription,
  today: string,
): number | null {
  if (!isWithinActiveWindow(sub, today)) {
    return null;
  }
  return monthlyEquivalentForSubscription(sub);
}

function findActualBillingDateForCurrentMonth(
  sub: Subscription,
  today: string,
): string | null {
  if (sub.billingCycle === "custom") return null;

  // Case 1: upcoming payment this month
  if (isInCurrentMonth(sub.nextBillingDate, today)) {
    return sub.nextBillingDate;
  }

  // Case 2: already paid this month, nextBillingDate was advanced past current month
  const anchorDay =
    sub.billingAnchorDay ?? getBillingAnchorDay(sub.nextBillingDate);
  const prevDate = getPreviousBillingDate(
    sub.nextBillingDate,
    sub.billingCycle,
    anchorDay,
    sub.billingInterval,
  );
  if (!prevDate || !isInCurrentMonth(prevDate, today) || prevDate > today) {
    return null;
  }

  // Verify this is a real past billing, not a phantom first billing.
  // Require that there was at least one full cycle before prevDate.
  const prevPrevDate = getPreviousBillingDate(
    prevDate,
    sub.billingCycle,
    anchorDay,
    sub.billingInterval,
  );
  if (prevPrevDate && sub.createdAt.slice(0, 10) <= prevPrevDate) {
    return prevDate;
  }

  return null;
}

function actualAmountIfDueThisMonth(
  sub: Subscription,
  today: string,
): number | null {
  const billingDate = findActualBillingDateForCurrentMonth(sub, today);
  return billingDate !== null ? (sub.price ?? 0) : null;
}

function isWithinActiveWindow(sub: Subscription, today: string): boolean {
  let nextDate = sub.nextBillingDate;

  // Advance past-due dates to the next future date
  if (nextDate < today) {
    const anchorDay =
      sub.billingAnchorDay ?? getBillingAnchorDay(sub.nextBillingDate);
    let iterations = 0;
    while (nextDate < today && iterations < 400) {
      const next = getNextBillingDate(
        nextDate,
        sub.billingCycle,
        anchorDay,
        sub.billingInterval,
      );
      if (!next || next <= nextDate) break;
      nextDate = next;
      iterations++;
    }
    if (nextDate < today) return false;
  }

  let windowEnd: string;
  if (sub.billingCycle === "interval") {
    const intervalEnd = intervalWindowEnd(sub, today);
    if (!intervalEnd) return false;
    windowEnd = intervalEnd;
  } else if (sub.billingCycle === "weekly") windowEnd = addDays(today, 7);
  else if (sub.billingCycle === "monthly") windowEnd = addMonths(today, 1);
  else if (sub.billingCycle === "quarterly") windowEnd = addMonths(today, 3);
  else if (sub.billingCycle === "yearly") windowEnd = addYears(today, 1);
  else return false;

  return nextDate <= windowEnd;
}

function intervalWindowEnd(sub: Subscription, today: string): string | null {
  if (sub.billingCycle !== "interval") return null;
  if (!sub.billingInterval) return null;
  if (sub.billingInterval.unit === "day") {
    return addDays(today, sub.billingInterval.count);
  }
  if (sub.billingInterval.unit === "week") {
    return addDays(today, sub.billingInterval.count * 7);
  }
  if (sub.billingInterval.unit === "month") {
    return addMonths(today, sub.billingInterval.count);
  }
  if (sub.billingInterval.unit === "year") {
    return addYears(today, sub.billingInterval.count);
  }
  return null;
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

function projectedAmountsByMonth(
  sub: Subscription,
  today: string,
): Map<string, number> | null {
  if (sub.billingCycle === "custom") return null;
  if (sub.price === undefined) return null;
  if (!sub.currency) return null;

  const yearAhead = addYears(today, 1);
  if (sub.nextBillingDate > yearAhead) return null;

  const anchorDay =
    sub.billingAnchorDay ?? getBillingAnchorDay(sub.nextBillingDate);
  const windowStartMonth = today.slice(0, 7);
  const windowEndMonth = addMonths(windowStartMonth + "-01", 11).slice(0, 7);
  const price = sub.price;
  const result = new Map<string, number>();

  // Advance past-due dates to the next future date
  let nextDate = sub.nextBillingDate;
  if (nextDate < today) {
    let iterations = 0;
    while (nextDate < today && iterations < 400) {
      const next = getNextBillingDate(
        nextDate,
        sub.billingCycle,
        anchorDay,
        sub.billingInterval,
      );
      if (!next || next <= nextDate) break;
      nextDate = next;
      iterations++;
    }
    if (nextDate < today) return null;
  }

  // Lookback: check if the previous billing was in current month and already passed
  const prevDate = getPreviousBillingDate(
    nextDate,
    sub.billingCycle,
    anchorDay,
    sub.billingInterval,
  );
  if (prevDate) {
    const prevMonthKey = prevDate.slice(0, 7);
    if (
      prevMonthKey === windowStartMonth &&
      prevDate <= today &&
      sub.createdAt.slice(0, 10) <= prevDate
    ) {
      result.set(prevMonthKey, (result.get(prevMonthKey) ?? 0) + price);
    }
  }

  // Forward projection from nextDate
  let billingDate = nextDate;
  let iterations = 0;
  while (billingDate.slice(0, 7) <= windowEndMonth && iterations < 400) {
    if (billingDate.slice(0, 7) >= windowStartMonth) {
      const monthKey = billingDate.slice(0, 7);
      result.set(monthKey, (result.get(monthKey) ?? 0) + price);
    }
    const next = getNextBillingDate(
      billingDate,
      sub.billingCycle,
      anchorDay,
      sub.billingInterval,
    );
    if (!next || next <= billingDate) break;
    billingDate = next;
    iterations++;
  }

  return result.size > 0 ? result : null;
}

function totalProjectedInYear(
  sub: Subscription,
  today: string,
): number | null {
  const amounts = projectedAmountsByMonth(sub, today);
  if (!amounts) return null;
  let total = 0;
  for (const amount of amounts.values()) {
    total += amount;
  }
  return total > 0 ? total : null;
}

function buildYearMonthDistribution(
  subscriptions: Subscription[],
  exchangeRates: ExchangeRateConfig | null,
  now: Date,
): ReportMonthDistribution[] {
  const today = now.toISOString().slice(0, 10);
  const windowStartMonth = today.slice(0, 7);

  const monthTotals = new Map<string, number>();
  let currentMonth = windowStartMonth;
  for (let i = 0; i < 12; i++) {
    monthTotals.set(currentMonth, 0);
    currentMonth = addMonths(currentMonth + "-01", 1).slice(0, 7);
  }

  for (const sub of subscriptions) {
    if (sub.status === "paused") continue;
    if (sub.price === undefined) continue;
    if (!sub.currency) continue;
    if (sub.billingCycle === "custom") continue;

    const currency = sub.currency.toUpperCase();
    const rate = exchangeRates?.rates[currency];
    if (rate === undefined) continue;

    const amounts = projectedAmountsByMonth(sub, today);
    if (!amounts) continue;

    for (const [monthKey, amount] of amounts) {
      if (monthTotals.has(monthKey)) {
        monthTotals.set(
          monthKey,
          (monthTotals.get(monthKey) ?? 0) + amount * rate,
        );
      }
    }
  }

  return Array.from(monthTotals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, actualTotal]) => ({ monthKey, actualTotal }));
}

export function buildTextReportData(
  subscriptions: Subscription[],
  exchangeRates: ExchangeRateConfig | null,
  now: Date = new Date(),
): TextReportData {
  const today = now.toISOString().slice(0, 10);
  const currentMonthKey = today.slice(0, 7);
  const generatedAt = now.toISOString();

  const currentMonthItems: TextReportSubscriptionItem[] = [];
  for (const sub of subscriptions) {
    if (sub.status === "paused") continue;
    if (sub.price === undefined) continue;
    if (!sub.currency) continue;
    if (sub.billingCycle === "custom") continue;

    const billingDate = findActualBillingDateForCurrentMonth(sub, today);
    if (billingDate === null) continue;

    const currency = sub.currency.toUpperCase();
    const rate = exchangeRates?.rates[currency];
    const convertedAmount =
      rate !== undefined ? sub.price * rate : undefined;

    currentMonthItems.push({
      name: sub.name,
      amount: sub.price,
      currency,
      convertedAmount,
      billingDay: getBillingDay(billingDate),
    });
  }

  currentMonthItems.sort((a, b) => {
    if (a.billingDay !== b.billingDay) return a.billingDay! - b.billingDay!;
    return a.name.localeCompare(b.name);
  });

  let currentMonthTotal = 0;
  for (const item of currentMonthItems) {
    if (item.convertedAmount !== undefined) {
      currentMonthTotal += item.convertedAmount;
    }
  }

  const yearMonthMap = new Map<
    string,
    { totalConverted: number; items: TextReportSubscriptionItem[] }
  >();

  let cursorMonth = currentMonthKey;
  for (let i = 0; i < 12; i++) {
    yearMonthMap.set(cursorMonth, { totalConverted: 0, items: [] });
    cursorMonth = addMonths(cursorMonth + "-01", 1).slice(0, 7);
  }

  for (const sub of subscriptions) {
    if (sub.status === "paused") continue;
    if (sub.price === undefined) continue;
    if (!sub.currency) continue;
    if (sub.billingCycle === "custom") continue;

    const currency = sub.currency.toUpperCase();
    const rate = exchangeRates?.rates[currency];

    const amounts = projectedAmountsByMonth(sub, today);
    if (!amounts) continue;

    for (const [monthKey, amount] of amounts) {
      const entry = yearMonthMap.get(monthKey);
      if (!entry) continue;

      const convertedAmount = rate !== undefined ? amount * rate : undefined;
      if (convertedAmount !== undefined) {
        entry.totalConverted += convertedAmount;
      }

      entry.items.push({
        name: sub.name,
        amount,
        currency,
        convertedAmount,
      });
    }
  }

  const yearMonthItems: TextReportMonthItems[] = [];
  for (const [monthKey, entry] of yearMonthMap) {
    entry.items.sort((a, b) => {
      const aVal = a.convertedAmount ?? 0;
      const bVal = b.convertedAmount ?? 0;
      if (bVal !== aVal) return bVal - aVal;
      return a.name.localeCompare(b.name);
    });
    yearMonthItems.push({
      monthKey,
      totalConverted: entry.totalConverted,
      items: entry.items,
    });
  }

  let yearTotal = 0;
  for (const month of yearMonthItems) {
    yearTotal += month.totalConverted;
  }

  return {
    generatedAt,
    baseCurrency: REPORT_BASE_CURRENCY,
    currentMonthKey,
    currentMonthItems,
    currentMonthTotal,
    yearMonthItems,
    yearTotal,
  };
}

const TELEGRAM_MSG_LIMIT = 4096;

export function formatTextReport(data: TextReportData): string[] {
  const chunks: string[] = [];
  let current = "";

  const push = (line: string): void => {
    const withNewline = current.length === 0 ? line : "\n" + line;
    if (current.length + withNewline.length > TELEGRAM_MSG_LIMIT) {
      chunks.push(current);
      current = line;
    } else {
      current += withNewline;
    }
  };

  const fmtItem = (item: TextReportSubscriptionItem): string => {
    const money = formatMoney(item.amount, item.currency);
    const arrow =
      item.convertedAmount !== undefined &&
      item.currency !== data.baseCurrency
        ? ` → ${formatMoney(item.convertedAmount, data.baseCurrency)}`
        : "";
    const day = item.billingDay !== undefined ? `  ${item.billingDay}日` : "";
    return `${item.name}  ${money}${arrow}${day}`;
  };

  push(`当月支出 · ${data.currentMonthKey}`);

  if (data.currentMonthItems.length === 0) {
    push("暂无扣款");
  } else {
    for (const item of data.currentMonthItems) {
      push(fmtItem(item));
    }
    push(`合计 ${formatMoney(data.currentMonthTotal, data.baseCurrency)}`);
  }

  push("───");
  push(`年度预期 · ${data.currentMonthKey}~${data.yearMonthItems.length > 0 ? data.yearMonthItems[data.yearMonthItems.length - 1].monthKey : data.currentMonthKey}`);

  let yearHasItems = false;
  for (const month of data.yearMonthItems) {
    if (month.items.length === 0) continue;
    yearHasItems = true;

    push(`${month.monthKey} · ${formatMoney(month.totalConverted, data.baseCurrency)}`);
    for (const item of month.items) {
      push(`  ${fmtItem(item)}`);
    }
  }

  if (!yearHasItems) {
    push("暂无预期扣款");
  } else {
    push(`年度合计 ${formatMoney(data.yearTotal, data.baseCurrency)}`);
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}
