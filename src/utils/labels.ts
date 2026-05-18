import type {
  BillingCycle,
  BillingInterval,
  SubscriptionStatus,
} from "../models/subscription.js";
import { formatBillingCycleValue } from "./billingCycle.js";

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: "活跃",
  paused: "已暂停",
};

export function formatStatus(status: SubscriptionStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function formatBillingCycle(
  cycle: BillingCycle,
  interval?: BillingInterval,
): string {
  return formatBillingCycleValue(cycle, interval);
}
