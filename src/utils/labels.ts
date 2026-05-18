import type { BillingCycle, BillingInterval } from "../models/subscription.js";
import { formatBillingCycleValue } from "./billingCycle.js";

export function formatBillingCycle(
  cycle: BillingCycle,
  interval?: BillingInterval,
): string {
  return formatBillingCycleValue(cycle, interval);
}
