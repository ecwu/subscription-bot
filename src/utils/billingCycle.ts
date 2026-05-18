import type {
  BillingCycle,
  BillingInterval,
  Subscription,
} from "../models/subscription.js";
import { ValidationError } from "./errors.js";

export const STANDARD_BILLING_CYCLES = [
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
  "custom",
] as const satisfies readonly BillingCycle[];

export interface ParsedBillingCycle {
  billingCycle: BillingCycle;
  billingInterval?: BillingInterval;
}

const INTERVAL_LIMITS: Record<BillingInterval["unit"], number> = {
  day: 366,
  week: 52,
};

const ENGLISH_UNITS: Record<string, BillingInterval["unit"] | undefined> = {
  d: "day",
  day: "day",
  days: "day",
  w: "week",
  week: "week",
  weeks: "week",
};

const CHINESE_UNITS: Record<string, BillingInterval["unit"] | undefined> = {
  天: "day",
  日: "day",
  周: "week",
  週: "week",
  星期: "week",
};

export function parseBillingCycleText(input: string): ParsedBillingCycle {
  const trimmed = input.trim();
  if (STANDARD_BILLING_CYCLES.some((cycle) => cycle === trimmed)) {
    return { billingCycle: trimmed as BillingCycle };
  }

  const interval = parseBillingInterval(trimmed);
  if (interval) {
    return { billingCycle: "interval", billingInterval: interval };
  }

  throw new ValidationError(
    `周期无效：“${input}”。可选值：${STANDARD_BILLING_CYCLES.join(
      ", ",
    )}，或 every 30 days、30d、4w、每30天、每4周。`,
  );
}

export function parseBillingInterval(input: string): BillingInterval | null {
  const normalized = input.trim().toLowerCase().replace(/\s+/g, " ");

  const compactEnglish = normalized.match(/^(\d+)(d|w)$/);
  if (compactEnglish) {
    return validateBillingInterval(
      Number(compactEnglish[1]),
      ENGLISH_UNITS[compactEnglish[2]],
      input,
    );
  }

  const english = normalized.match(/^(?:every\s+)?(\d+)\s+(days?|weeks?)$/);
  if (english) {
    return validateBillingInterval(
      Number(english[1]),
      ENGLISH_UNITS[english[2]],
      input,
    );
  }

  const chinese = input.trim().match(/^每\s*(\d+)\s*(天|日|周|週|星期)$/);
  if (chinese) {
    return validateBillingInterval(
      Number(chinese[1]),
      CHINESE_UNITS[chinese[2]],
      input,
    );
  }

  return null;
}

export function validateBillingInterval(
  count: number,
  unit: BillingInterval["unit"] | undefined,
  input: string,
): BillingInterval {
  if (!unit) {
    throw new ValidationError(
      `周期无效：“${input}”。仅支持天或周，例如 30d、4w。`,
    );
  }

  const max = INTERVAL_LIMITS[unit];
  if (!Number.isInteger(count) || count < 1 || count > max) {
    throw new ValidationError(
      unit === "day"
        ? `天数间隔无效：“${input}”。请输入 1 到 366 天。`
        : `周数间隔无效：“${input}”。请输入 1 到 52 周。`,
    );
  }

  return { unit, count };
}

export function formatBillingCycleValue(
  billingCycle: BillingCycle,
  billingInterval?: BillingInterval,
): string {
  if (billingCycle === "interval" && billingInterval) {
    return billingInterval.unit === "day"
      ? `每 ${billingInterval.count} 天`
      : `每 ${billingInterval.count} 周`;
  }

  const labels: Record<Exclude<BillingCycle, "interval">, string> = {
    weekly: "每周",
    monthly: "每月",
    quarterly: "每季度",
    yearly: "每年",
    custom: "自定义",
  };

  return billingCycle === "interval" ? "自定义间隔" : labels[billingCycle];
}

export function formatSubscriptionBillingCycle(sub: Subscription): string {
  return formatBillingCycleValue(sub.billingCycle, sub.billingInterval);
}
