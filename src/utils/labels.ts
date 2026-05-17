import type { BillingCycle } from "../models/subscription.js";

const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  weekly: "每周",
  monthly: "每月",
  quarterly: "每季度",
  yearly: "每年",
  custom: "自定义",
};

export function formatBillingCycle(cycle: BillingCycle): string {
  return BILLING_CYCLE_LABELS[cycle] ?? cycle;
}
