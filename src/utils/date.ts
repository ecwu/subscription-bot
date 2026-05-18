import type { BillingCycle } from "../models/subscription.js";

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

function addMonthsAnchored(
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
): string | null {
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
