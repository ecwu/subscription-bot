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
  "quarterly",
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
      "用法：/edit <id> date <YYYY-MM-DD>\n" +
        "      /edit <id> price <金额> <币种>\n" +
        "      /edit <id> cycle <weekly|monthly|quarterly|yearly|custom>",
    );
  }

  const subId = args[1];
  const field = args[2];

  if (!subId || subId.trim().length === 0) {
    throw new ValidationError("订阅 ID 不能为空。");
  }

  if (field === "date") {
    const dateStr = args[3];
    if (!DATE_REGEX.test(dateStr)) {
      throw new ValidationError(
        `日期无效：“${dateStr}”。请使用 YYYY-MM-DD 格式。`,
      );
    }
    const parsedDate = new Date(dateStr + "T00:00:00Z");
    if (
      isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== dateStr
    ) {
      throw new ValidationError(
        `日期无效：“${dateStr}”。请使用 YYYY-MM-DD 格式。`,
      );
    }
    return { subId, field: "date", nextBillingDate: dateStr };
  }

  if (field === "price") {
    if (args.length < 5) {
      throw new ValidationError(
        "用法：/edit <id> price <金额> <币种>\n" +
          "示例：/edit a1b2c3d4 price 15.99 CNY",
      );
    }
    const priceStr = args[3];
    const currency = args[4].toUpperCase();
    const price = Number(priceStr);
    if (!Number.isFinite(price) || price < 0) {
      throw new ValidationError(
        `价格无效：“${priceStr}”。价格必须是非负数字。`,
      );
    }
    return { subId, field: "price", price, currency };
  }

  if (field === "cycle") {
    const cycle = args[3];
    if (!VALID_CYCLES.includes(cycle as BillingCycle)) {
      throw new ValidationError(
        `周期无效：“${cycle}”。可选值：${VALID_CYCLES.join(", ")}。`,
      );
    }
    return { subId, field: "cycle", billingCycle: cycle as BillingCycle };
  }

  throw new ValidationError(`未知字段：“${field}”。支持：date、price、cycle。`);
}
