import { ValidationError } from "./errors.js";
import type { BillingCycle } from "../models/subscription.js";

export interface ParsedEditArgs {
  subId: string;
  field: "date" | "price" | "cycle";
  nextBillingDate?: string;
  price?: number;
  currency?: string;
  billingCycle?: BillingCycle;
}

const VALID_CYCLES: readonly BillingCycle[] = [
  "weekly",
  "monthly",
  "yearly",
  "custom",
];

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse the arguments for the /edit command.
 *
 * Expected formats:
 *   /edit <id> date <YYYY-MM-DD>
 *   /edit <id> price <amount> <currency>
 *   /edit <id> cycle <weekly|monthly|yearly|custom>
 *
 * Examples:
 *   /edit a1b2c3d4 date 2026-07-01
 *   /edit a1b2c3d4 price 15.99 USD
 *   /edit a1b2c3d4 cycle yearly
 */
export function parseEditArgs(args: string[]): ParsedEditArgs {
  // args[0] is the command itself, need at least: /edit <id> <field> <value>
  if (args.length < 4) {
    throw new ValidationError(
      "Usage: /edit <id> date <YYYY-MM-DD>\n" +
        "       /edit <id> price <amount> <currency>\n" +
        "       /edit <id> cycle <weekly|monthly|yearly|custom>"
    );
  }

  const subId = args[1];
  const field = args[2];

  if (!subId || subId.trim().length === 0) {
    throw new ValidationError("Subscription ID is required.");
  }

  if (field === "date") {
    const dateStr = args[3];
    if (!DATE_REGEX.test(dateStr)) {
      throw new ValidationError(
        `Invalid date: "${dateStr}". Use YYYY-MM-DD format.`
      );
    }
    const parsedDate = new Date(dateStr + "T00:00:00Z");
    if (isNaN(parsedDate.getTime())) {
      throw new ValidationError(
        `Invalid date: "${dateStr}". Use YYYY-MM-DD format.`
      );
    }
    return { subId, field: "date", nextBillingDate: dateStr };
  }

  if (field === "price") {
    if (args.length < 5) {
      throw new ValidationError(
        "Usage: /edit <id> price <amount> <currency>\n" +
          "Example: /edit a1b2c3d4 price 15.99 USD"
      );
    }
    const priceStr = args[3];
    const currency = args[4].toUpperCase();
    const price = Number(priceStr);
    if (!Number.isFinite(price) || price < 0) {
      throw new ValidationError(
        `Invalid price: "${priceStr}". Price must be a non-negative number.`
      );
    }
    return { subId, field: "price", price, currency };
  }

  if (field === "cycle") {
    const cycle = args[3];
    if (!VALID_CYCLES.includes(cycle as BillingCycle)) {
      throw new ValidationError(
        `Invalid cycle: "${cycle}". Allowed: ${VALID_CYCLES.join(", ")}.`
      );
    }
    return { subId, field: "cycle", billingCycle: cycle as BillingCycle };
  }

  throw new ValidationError(
    `Unknown field: "${field}". Supported: date, price, cycle.`
  );
}
