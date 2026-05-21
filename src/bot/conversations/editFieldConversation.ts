import { Conversation } from "@grammyjs/conversations";
import { BotContext, BaseBotContext } from "../../types/context.js";
import { createSubscriptionService } from "../../services/subscriptionService.js";
import { createSubscriptionRepository } from "../../repositories/subscriptionRepository.js";
import { createReminderRepository } from "../../repositories/reminderRepository.js";
import { createLogger } from "../../utils/logger.js";
import { InlineKeyboard } from "grammy";
import {
  BillingCycle,
  BillingInterval,
  Subscription,
} from "../../models/subscription.js";
import { formatBillingCycle } from "../../utils/labels.js";
import { getBillingAnchorDay } from "../../utils/date.js";
import { parseBillingCycleText } from "../../utils/billingCycle.js";
import { parseFlexibleDate } from "../../utils/parseDate.js";
import { ValidationError } from "../../utils/errors.js";
import {
  buildDetailKeyboard,
  formatDetailText,
} from "../keyboards/listManagerKeyboard.js";
import { validateCurrencyCode } from "../../utils/currency.js";

interface ListManagerConversationOptions {
  source?: "listManager";
  page?: number;
}

function isFromListManager(options?: ListManagerConversationOptions): boolean {
  return options?.source === "listManager";
}

function restartHint(options?: ListManagerConversationOptions): string {
  return isFromListManager(options)
    ? "\n请重新从详情中选择编辑。"
    : "\n请发送 /edit 重新开始。";
}

async function replyWithListManagerDetail(
  ctx: BaseBotContext,
  sub: Subscription,
  page: number,
): Promise<void> {
  await ctx.reply(formatDetailText(sub), {
    reply_markup: buildDetailKeyboard(sub, page),
  });
}

// TODO: grammY conversations do not have built-in timeout handling.
// If a user starts an edit flow and never completes it, the conversation
// waits indefinitely until the isolate is recycled or the user sends /cancel.
// On Cloudflare Workers, isolates may be evicted after inactivity, which
// implicitly ends conversations. For MVP this is acceptable.

export function validateEditName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "订阅名称不能为空。";
  return null;
}

export function validateEditPrice(priceStr: string): {
  price: number;
  error?: string;
} {
  const trimmed = priceStr.trim();
  const price = Number(trimmed);
  if (!Number.isFinite(price) || price < 0) {
    return { price: 0, error: "请输入非负数字。" };
  }
  return { price };
}

export const validateEditCurrency = validateCurrencyCode;

export function validateEditDate(dateStr: string): {
  date?: string;
  error?: string;
} {
  return parseFlexibleDate(dateStr);
}

export async function editFieldConversation(
  conversation: Conversation<BotContext, BaseBotContext>,
  ctx: BaseBotContext,
  subId: string,
  field: "name" | "price" | "currency" | "date",
  options?: ListManagerConversationOptions,
): Promise<void> {
  // grammY conversations do not inherit custom middleware properties.
  // Read required fields from the outside context via external().
  const ctxData = await conversation.external((outsideCtx) => ({
    userKey: outsideCtx.userKey ?? null,
    encryptionKey: outsideCtx.env.ENCRYPTION_KEY,
    requestId: outsideCtx.requestId,
  }));

  if (!ctxData.userKey) {
    await ctx.reply("无法识别用户，请稍后再试。");
    return;
  }

  const userKey = ctxData.userKey;
  const encryptionKey = ctxData.encryptionKey;
  const logger = createLogger(ctxData.requestId);

  const sub = await conversation.external(async (outsideCtx) => {
    const repo = createSubscriptionRepository(outsideCtx.env.SUBSCRIPTION_KV);
    const reminderRepo = createReminderRepository(
      outsideCtx.env.SUBSCRIPTION_KV,
    );
    const service = createSubscriptionService(repo, reminderRepo);
    return service.get(userKey, subId, encryptionKey);
  });

  if (!sub) {
    await ctx.reply("没有找到这个订阅，或它已被删除。");
    return;
  }

  const fieldLabels: Record<string, string> = {
    name: "名称",
    price: "价格",
    currency: "币种",
    date: "下次扣款日期",
  };

  const promptMap: Record<string, string> = {
    name: `当前名称：${sub.name}\n请发送新名称。`,
    price:
      sub.price !== undefined
        ? `当前价格：${sub.price}\n请发送新价格（数字）。`
        : "当前未填写价格。\n请发送价格（数字）。",
    currency:
      sub.currency !== undefined
        ? `当前币种：${sub.currency}\n请发送新币种（3 位代码）。`
        : "当前未填写币种。\n请发送币种（3 位代码）。",
    date: `当前下次扣款日期：${sub.nextBillingDate}\n请发送新日期（YYYY-MM-DD）。`,
  };

  await ctx.reply(promptMap[field]);

  const inputCtx = await conversation.waitFor("message:text");
  const input = inputCtx.msg.text;

  if (input.trim() === "/cancel" || input.trim() === "取消") {
    await ctx.reply("已取消。");
    return;
  }

  const now = new Date().toISOString();
  const updated = { ...sub, updatedAt: now };

  if (field === "name") {
    const error = validateEditName(input);
    if (error) {
      await ctx.reply(error + restartHint(options));
      return;
    }
    updated.name = input.trim();
  } else if (field === "price") {
    const result = validateEditPrice(input);
    if (result.error) {
      await ctx.reply(result.error + restartHint(options));
      return;
    }
    updated.price = result.price;
  } else if (field === "currency") {
    const result = validateEditCurrency(input);
    if (result.error) {
      await ctx.reply(result.error + restartHint(options));
      return;
    }
    updated.currency = result.currency;
  } else if (field === "date") {
    const result = validateEditDate(input);
    if (result.error) {
      await ctx.reply(result.error + restartHint(options));
      return;
    }
    updated.nextBillingDate = result.date!;
    updated.billingAnchorDay = getBillingAnchorDay(result.date!);
  }

  await conversation.external(async (outsideCtx) => {
    const repo = createSubscriptionRepository(outsideCtx.env.SUBSCRIPTION_KV);
    const reminderRepo = createReminderRepository(
      outsideCtx.env.SUBSCRIPTION_KV,
    );
    const service = createSubscriptionService(repo, reminderRepo);
    await service.update(userKey, updated, encryptionKey);
  });

  logger.info("Subscription field updated via conversation", {
    subId,
    field,
  });

  if (isFromListManager(options)) {
    await ctx.reply(`已更新“${updated.name}”的${fieldLabels[field]}。`);
    await replyWithListManagerDetail(ctx, updated, options?.page ?? 0);
    return;
  }

  await ctx.reply(
    `已更新“${updated.name}”的${fieldLabels[field]}。\n发送 /view 查看结果。`,
  );
}

export async function editCycleConversation(
  conversation: Conversation<BotContext, BaseBotContext>,
  ctx: BaseBotContext,
  subId: string,
  options?: ListManagerConversationOptions,
): Promise<void> {
  // grammY conversations do not inherit custom middleware properties.
  // Read required fields from the outside context via external().
  const ctxData = await conversation.external((outsideCtx) => ({
    userKey: outsideCtx.userKey ?? null,
    encryptionKey: outsideCtx.env.ENCRYPTION_KEY,
    requestId: outsideCtx.requestId,
  }));

  if (!ctxData.userKey) {
    await ctx.reply("无法识别用户，请稍后再试。");
    return;
  }

  const userKey = ctxData.userKey;
  const encryptionKey = ctxData.encryptionKey;
  const logger = createLogger(ctxData.requestId);

  const sub = await conversation.external(async (outsideCtx) => {
    const repo = createSubscriptionRepository(outsideCtx.env.SUBSCRIPTION_KV);
    const reminderRepo = createReminderRepository(
      outsideCtx.env.SUBSCRIPTION_KV,
    );
    const service = createSubscriptionService(repo, reminderRepo);
    return service.get(userKey, subId, encryptionKey);
  });

  if (!sub) {
    await ctx.reply("没有找到这个订阅，或它已被删除。");
    return;
  }

  const cycleKeyboard = new InlineKeyboard()
    .text("每周", `editcycle:weekly:${subId}`)
    .text("每月", `editcycle:monthly:${subId}`)
    .row()
    .text("每季度", `editcycle:quarterly:${subId}`)
    .text("每年", `editcycle:yearly:${subId}`)
    .row()
    .text("自定义", `editcycle:custom:${subId}`)
    .text("高级间隔", `editcycle:interval:${subId}`);

  await ctx.reply("请选择新的扣款周期：", {
    reply_markup: cycleKeyboard,
  });

  const cycleCtx = await conversation.waitForCallbackQuery(/^editcycle:/);
  const callbackData = cycleCtx.callbackQuery.data;
  const cycle = callbackData.split(":")[1] as BillingCycle;
  let billingInterval: BillingInterval | undefined;

  await cycleCtx.answerCallbackQuery();
  await cycleCtx.deleteMessage();

  if (cycle === "interval") {
    await ctx.reply(
      "请输入间隔，例如 every 30 days、every 4 weeks、6m、2y、30d、4w、每30天、每4周、每6个月、每2年。",
    );
    const intervalCtx = await conversation.waitFor("message:text");
    const intervalText = intervalCtx.msg.text;
    if (intervalText.trim() === "/cancel" || intervalText.trim() === "取消") {
      await ctx.reply("已取消。");
      return;
    }
    try {
      const parsedCycle = parseBillingCycleText(intervalText);
      if (
        parsedCycle.billingCycle !== "interval" ||
        !parsedCycle.billingInterval
      ) {
        await ctx.reply("请输入高级间隔，例如 30d、4w、6m 或 2y。");
        return;
      }
      billingInterval = parsedCycle.billingInterval;
    } catch (err) {
      if (err instanceof ValidationError) {
        await ctx.reply(err.message + restartHint(options));
        return;
      }
      throw err;
    }
  }

  const now = new Date().toISOString();
  const updated = {
    ...sub,
    billingCycle: cycle,
    billingInterval,
    updatedAt: now,
  };

  await conversation.external(async (outsideCtx) => {
    const repo = createSubscriptionRepository(outsideCtx.env.SUBSCRIPTION_KV);
    const reminderRepo = createReminderRepository(
      outsideCtx.env.SUBSCRIPTION_KV,
    );
    const service = createSubscriptionService(repo, reminderRepo);
    await service.update(userKey, updated, encryptionKey);
  });

  logger.info("Subscription cycle updated via conversation", { subId, cycle });

  if (isFromListManager(options)) {
    await ctx.reply(
      `已将“${updated.name}”的周期更新为${formatBillingCycle(
        cycle,
        billingInterval,
      )}。`,
    );
    await replyWithListManagerDetail(ctx, updated, options?.page ?? 0);
    return;
  }

  await ctx.reply(
    `已将“${updated.name}”的周期更新为${formatBillingCycle(
      cycle,
      billingInterval,
    )}。\n发送 /view 查看结果。`,
  );
}
