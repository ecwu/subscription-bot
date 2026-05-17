import type { Subscription } from "../models/subscription.js";
import { shortId } from "./shortId.js";

/**
 * Format a single subscription line for /list output.
 */
export function formatSubscriptionLine(
  sub: Subscription,
  index: number
): string {
  const priceStr =
    sub.price !== undefined && sub.currency
      ? `${sub.price} ${sub.currency}`
      : sub.price !== undefined
        ? `${sub.price}`
        : "";
  const parts = [
    sub.name,
    priceStr,
    sub.billingCycle,
    `next: ${sub.nextBillingDate}`,
    `id: ${shortId(sub.id)}`,
  ].filter(Boolean);
  return `${index + 1}. ${parts.join(" — ")}`;
}
