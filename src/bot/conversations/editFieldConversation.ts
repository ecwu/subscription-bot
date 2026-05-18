import { Conversation } from "@grammyjs/conversations";
import { BotContext, BaseBotContext } from "../../types/context.js";
import { createSubscriptionService } from "../../services/subscriptionService.js";
import { createSubscriptionRepository } from "../../repositories/subscriptionRepository.js";
import { createReminderRepository } from "../../repositories/reminderRepository.js";
import { createLogger } from "../../utils/logger.js";
import { InlineKeyboard } from "grammy";
import { BillingCycle } from "../../models/subscription.js";
import { formatBillingCycle } from "../../utils/labels.js";
import { getBillingAnchorDay } from "../../utils/date.js";

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

export function validateEditCurrency(currencyStr: string): {
  currency: string;
  error?: string;
} {
  const trimmed = currencyStr.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(trimmed)) {
    return {
      currency: "",
      error: "请输入 3 位币种代码，例如 CNY 或 USD。",
    };
  }
  return { currency: trimmed };
}

export function validateEditDate(dateStr: string): {
  date?: string;
  error?: string;
} {
  const trimmed = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { error: "请使用 YYYY-MM-DD 格式，例如 2026-06-01。" };
  }
  const parsed = new Date(trimmed + "T00:00:00Z");
  if (
    isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== trimmed
  ) {
    return {
      error: "日期无效。请使用 YYYY-MM-DD 格式，例如 2026-06-01。",
    };
  }
  return { date: trimmed };
}

export async function editFieldConversation(
  conversation: Conversation<BotContext, BaseBotContext>,
  ctx: BaseBotContext,
  subId: string,
  field: "name" | "price" | "currency" | "date",
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
      await ctx.reply(error + "\n请发送 /edit 重新开始。");
      return;
    }
    updated.name = input.trim();
  } else if (field === "price") {
    const result = validateEditPrice(input);
    if (result.error) {
      await ctx.reply(result.error + "\n请发送 /edit 重新开始。");
      return;
    }
    updated.price = result.price;
  } else if (field === "currency") {
    const result = validateEditCurrency(input);
    if (result.error) {
      await ctx.reply(result.error + "\n请发送 /edit 重新开始。");
      return;
    }
    updated.currency = result.currency;
  } else if (field === "date") {
    const result = validateEditDate(input);
    if (result.error) {
      await ctx.reply(result.error + "\n请发送 /edit 重新开始。");
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

  await ctx.reply(
    `已更新“${updated.name}”的${fieldLabels[field]}。\n发送 /view 查看结果。`,
  );
}

export async function editCycleConversation(
  conversation: Conversation<BotContext, BaseBotContext>,
  ctx: BaseBotContext,
  subId: string,
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
    .text("自定义", `editcycle:custom:${subId}`);

  await ctx.reply("请选择新的扣款周期：", {
    reply_markup: cycleKeyboard,
  });

  const cycleCtx = await conversation.waitForCallbackQuery(/^editcycle:/);
  const callbackData = cycleCtx.callbackQuery.data;
  const cycle = callbackData.split(":")[1] as BillingCycle;

  await cycleCtx.answerCallbackQuery();
  await cycleCtx.deleteMessage();

  const now = new Date().toISOString();
  const updated = { ...sub, billingCycle: cycle, updatedAt: now };

  await conversation.external(async (outsideCtx) => {
    const repo = createSubscriptionRepository(outsideCtx.env.SUBSCRIPTION_KV);
    const reminderRepo = createReminderRepository(
      outsideCtx.env.SUBSCRIPTION_KV,
    );
    const service = createSubscriptionService(repo, reminderRepo);
    await service.update(userKey, updated, encryptionKey);
  });

  logger.info("Subscription cycle updated via conversation", { subId, cycle });

  await ctx.reply(
    `已将“${updated.name}”的周期更新为${formatBillingCycle(cycle)}。\n发送 /view 查看结果。`,
  );
}
