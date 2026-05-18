import type { Subscription } from "../models/subscription.js";

export function isTrialSubscription(sub: Subscription): boolean {
  return sub.isTrial === true;
}

export function isAutoRenewing(sub: Subscription): boolean {
  return sub.autoRenew !== false;
}

export function formatSubscriptionType(sub: Subscription): string {
  return isTrialSubscription(sub) ? "体验" : "付费";
}

export function formatAutoRenew(sub: Subscription): string {
  return isAutoRenewing(sub) ? "是" : "否";
}

export function formatBillingDateLabel(sub: Subscription): string {
  if (isTrialSubscription(sub)) return "体验到期/首次扣款";
  if (!isAutoRenewing(sub)) return "服务到期";
  return "下次扣款";
}

export function formatStatusPrefix(sub: Subscription): string {
  const labels: string[] = [];
  if (sub.status === "paused") labels.push("已暂停");
  if (isTrialSubscription(sub)) labels.push("体验");
  if (!isAutoRenewing(sub)) labels.push("已停续费");
  return labels.length > 0 ? `[${labels.join("][")}] ` : "";
}
