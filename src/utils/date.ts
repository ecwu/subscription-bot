import type { BillingCycle, BillingInterval } from "../models/subscription.js";

export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

export function addMonths(dateStr: string, months: number): string {
  const date = new Date(dateStr + "T00:00:00Z");
  date.setUTCMonth(date.getUTCMonth() + months);
  return formatDate(date);
}

export function addYears(dateStr: string, years: number): string {
  const date = new Date(dateStr + "T00:00:00Z");
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return formatDate(date);
}

export function addWeeks(dateStr: string, weeks: number): string {
  return addDays(dateStr, weeks * 7);
}

export function getBillingAnchorDay(dateStr: string): number {
  return Number(dateStr.slice(8, 10));
}

function getLastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function addMonthsAnchored(
  dateStr: string,
  months: number,
  billingAnchorDay: number,
): string {
  const date = new Date(dateStr + "T00:00:00Z");
  const targetMonth = date.getUTCMonth() + months;
  const target = new Date(Date.UTC(date.getUTCFullYear(), targetMonth, 1));
  const year = target.getUTCFullYear();
  const month = target.getUTCMonth();
  const lastDay = getLastDayOfMonth(year, month);
  const day = Math.min(billingAnchorDay, lastDay);
  return formatDate(new Date(Date.UTC(year, month, day)));
}

export function getNextBillingDate(
  currentDate: string,
  billingCycle: BillingCycle,
  billingAnchorDay: number,
  billingInterval?: BillingInterval,
): string | null {
  if (billingCycle === "interval") {
    if (!billingInterval) return null;
    if (billingInterval.unit === "day") {
      return addDays(currentDate, billingInterval.count);
    }
    if (billingInterval.unit === "week") {
      return addWeeks(currentDate, billingInterval.count);
    }
    if (billingInterval.unit === "month") {
      return addMonthsAnchored(currentDate, billingInterval.count, billingAnchorDay);
    }
    if (billingInterval.unit === "year") {
      return addMonthsAnchored(
        currentDate,
        billingInterval.count * 12,
        billingAnchorDay,
      );
    }
    return null;
  }
  if (billingCycle === "weekly") return addWeeks(currentDate, 1);
  if (billingCycle === "monthly") {
    return addMonthsAnchored(currentDate, 1, billingAnchorDay);
  }
  if (billingCycle === "quarterly") {
    return addMonthsAnchored(currentDate, 3, billingAnchorDay);
  }
  if (billingCycle === "yearly") {
    return addMonthsAnchored(currentDate, 12, billingAnchorDay);
  }
  return null;
}

export function isUtcOffset(timezone: string): boolean {
  return /^UTC[+-]\d{2}:\d{2}$/.test(timezone);
}

export function parseUtcOffsetMinutes(offset: string): number | null {
  const match = offset.match(/^UTC([+-])(\d{2}):(\d{2})$/);
  if (!match) return null;
  const sign = match[1] === "+" ? 1 : -1;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  return sign * (hours * 60 + minutes);
}

export function getLocalTimeInfo(
  timezone: string,
): { date: string; hour: number; minute: number } | null {
  if (!timezone || typeof timezone !== "string") return null;

  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      hourCycle: "h23",
    });
    const parts = fmt.formatToParts(new Date());
    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    const hourStr = parts.find((p) => p.type === "hour")?.value;
    const minuteStr = parts.find((p) => p.type === "minute")?.value;

    if (!year || !month || !day || !hourStr || !minuteStr) return null;

    return {
      date: `${year}-${month}-${day}`,
      hour: Number(hourStr),
      minute: Number(minuteStr),
    };
  } catch {
    // Intl failed — try manual UTC offset
  }

  const offsetMinutes = parseUtcOffsetMinutes(timezone);
  if (offsetMinutes === null) return null;

  const now = new Date();
  const localMs = now.getTime() + offsetMinutes * 60 * 1000;
  const local = new Date(localMs);

  return {
    date: formatDate(local),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
  };
}

export function getPreviousBillingDate(
  currentDate: string,
  billingCycle: BillingCycle,
  billingAnchorDay: number,
  billingInterval?: BillingInterval,
): string | null {
  if (billingCycle === "interval") {
    if (!billingInterval) return null;
    if (billingInterval.unit === "day") {
      return addDays(currentDate, -billingInterval.count);
    }
    if (billingInterval.unit === "week") {
      return addDays(currentDate, -(billingInterval.count * 7));
    }
    if (billingInterval.unit === "month") {
      return addMonthsAnchored(
        currentDate,
        -billingInterval.count,
        billingAnchorDay,
      );
    }
    if (billingInterval.unit === "year") {
      return addMonthsAnchored(
        currentDate,
        -(billingInterval.count * 12),
        billingAnchorDay,
      );
    }
    return null;
  }
  if (billingCycle === "weekly") return addDays(currentDate, -7);
  if (billingCycle === "monthly") {
    return addMonthsAnchored(currentDate, -1, billingAnchorDay);
  }
  if (billingCycle === "quarterly") {
    return addMonthsAnchored(currentDate, -3, billingAnchorDay);
  }
  if (billingCycle === "yearly") {
    return addMonthsAnchored(currentDate, -12, billingAnchorDay);
  }
  return null;
}
