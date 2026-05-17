import { ValidationError } from "./errors.js";
import type { BillingCycle } from "../models/subscription.js";

export interface ParsedAddArgs {
  name: string;
  price: number;
  currency: string;
  billingCycle: BillingCycle;
  nextBillingDate: string;
}

const VALID_CYCLES: readonly BillingCycle[] = [
  "weekly",
  "monthly",
  "yearly",
  "custom",
];

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse the arguments for the /add command.
 *
 * Expected format (single-word name for now):
 *   /add <name> <price> <currency> <cycle> <nextBillingDate>
 *
 * Example:
 *   /add Netflix 12.99 EUR monthly 2026-06-01
 *
 * TODO: Support quoted or multi-word names.
 */
export function parseAddArgs(args: string[]): ParsedAddArgs {
  // args[0] is the command itself (e.g. "/add"), so we need at least 6 elements
  if (args.length < 6) {
    throw new ValidationError(
      "Usage: /add <name> <price> <currency> <cycle> <nextBillingDate>\n" +
        "Example: /add Netflix 12.99 EUR monthly 2026-06-01"
    );
  }

  const name = args[1];
  const priceStr = args[2];
  const currency = args[3].toUpperCase();
  const cycle = args[4];
  const nextBillingDate = args[5];

  if (!name || name.trim().length === 0) {
    throw new ValidationError("Subscription name is required.");
  }

  const price = Number(priceStr);
  if (!Number.isFinite(price) || price < 0) {
    throw new ValidationError(
      `Invalid price: "${priceStr}". Price must be a non-negative number.`
    );
  }

  if (!VALID_CYCLES.includes(cycle as BillingCycle)) {
    throw new ValidationError(
      `Invalid cycle: "${cycle}". Allowed: ${VALID_CYCLES.join(", ")}.`
    );
  }

  if (!DATE_REGEX.test(nextBillingDate)) {
    throw new ValidationError(
      `Invalid date: "${nextBillingDate}". Use YYYY-MM-DD format.`
    );
  }

  // Validate that the date is actually parseable
  const parsedDate = new Date(nextBillingDate + "T00:00:00Z");
  if (isNaN(parsedDate.getTime())) {
    throw new ValidationError(
      `Invalid date: "${nextBillingDate}". Use YYYY-MM-DD format.`
    );
  }

  return {
    name,
    price,
    currency,
    billingCycle: cycle as BillingCycle,
    nextBillingDate,
  };
}
