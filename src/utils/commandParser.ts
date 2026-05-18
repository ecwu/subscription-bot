import { ValidationError } from "./errors.js";
import type { BillingCycle, BillingInterval } from "../models/subscription.js";
import { parseBillingCycleText } from "./billingCycle.js";

export interface ParsedAddArgs {
  name: string;
  price: number;
  currency: string;
  billingCycle: BillingCycle;
  billingInterval?: BillingInterval;
  nextBillingDate: string;
}

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
      "用法：/add <名称> <价格> <币种> <周期> <下次扣款日期>\n" +
        "示例：/add Netflix 12.99 CNY monthly 2026-06-01",
    );
  }

  const name = args[1];
  const priceStr = args[2];
  const currency = args[3].toUpperCase();
  const nextBillingDate = args[args.length - 1];
  const cycleText = args.slice(4, -1).join(" ");

  if (!name || name.trim().length === 0) {
    throw new ValidationError("订阅名称不能为空。");
  }

  const price = Number(priceStr);
  if (!Number.isFinite(price) || price < 0) {
    throw new ValidationError(`价格无效：“${priceStr}”。价格必须是非负数字。`);
  }

  const parsedCycle = parseBillingCycleText(cycleText);

  if (!DATE_REGEX.test(nextBillingDate)) {
    throw new ValidationError(
      `日期无效：“${nextBillingDate}”。请使用 YYYY-MM-DD 格式。`,
    );
  }

  // Validate that the date is actually parseable
  const parsedDate = new Date(nextBillingDate + "T00:00:00Z");
  if (
    isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== nextBillingDate
  ) {
    throw new ValidationError(
      `日期无效：“${nextBillingDate}”。请使用 YYYY-MM-DD 格式。`,
    );
  }

  return {
    name,
    price,
    currency,
    billingCycle: parsedCycle.billingCycle,
    billingInterval: parsedCycle.billingInterval,
    nextBillingDate,
  };
}
