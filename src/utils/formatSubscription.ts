import type { Subscription } from "../models/subscription.js";
import { shortId } from "./shortId.js";
import { formatBillingCycle, formatStatus } from "./labels.js";
import { formatDate } from "./date.js";

function formatPrice(sub: Subscription): string {
  if (sub.price !== undefined && sub.currency) {
    return `${sub.price} ${sub.currency}`;
  }
  if (sub.price !== undefined) {
    return `${sub.price}`;
  }
  return "";
}

function daysBetweenDates(fromDate: string, toDate: string): number {
  const from = new Date(fromDate + "T00:00:00Z").getTime();
  const to = new Date(toDate + "T00:00:00Z").getTime();
  return Math.round((to - from) / 86_400_000);
}

export function formatRelativeBillingDate(
  nextBillingDate: string,
  today = formatDate(new Date()),
): string {
  const days = daysBetweenDates(today, nextBillingDate);
  if (days === 0) return "今天";
  if (days > 0) return `${days} 天后`;
  return `已过期 ${Math.abs(days)} 天`;
}

function statusPrefix(sub: Subscription): string {
  return sub.status === "paused" ? `[${formatStatus(sub.status)}] ` : "";
}

export function formatSubscriptionLine(
  sub: Subscription,
  index: number,
  today = formatDate(new Date()),
): string {
  const parts = [
    `${statusPrefix(sub)}${sub.name}`,
    formatPrice(sub),
    `下次扣款：${formatRelativeBillingDate(sub.nextBillingDate, today)}`,
  ].filter(Boolean);
  return `${index + 1}. ${parts.join(" — ")}`;
}

export function formatSubscriptionFullLine(
  sub: Subscription,
  index: number,
): string {
  const parts = [
    `${statusPrefix(sub)}${sub.name}`,
    formatPrice(sub),
    formatBillingCycle(sub.billingCycle, sub.billingInterval),
    `下次扣款：${sub.nextBillingDate}`,
    `ID：${shortId(sub.id)}`,
  ].filter(Boolean);
  return `${index + 1}. ${parts.join(" — ")}`;
}
