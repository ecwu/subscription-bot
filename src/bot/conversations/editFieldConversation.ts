import { Conversation } from "@grammyjs/conversations";
import { BotContext, BaseBotContext } from "../../types/context.js";
import { createSubscriptionService } from "../../services/subscriptionService.js";
import { createSubscriptionRepository } from "../../repositories/subscriptionRepository.js";
import { createReminderRepository } from "../../repositories/reminderRepository.js";
import { createLogger } from "../../utils/logger.js";
import { InlineKeyboard } from "grammy";
import { BillingCycle } from "../../models/subscription.js";

// TODO: grammY conversations do not have built-in timeout handling.
// If a user starts an edit flow and never completes it, the conversation
// waits indefinitely until the isolate is recycled or the user sends /cancel.
// On Cloudflare Workers, isolates may be evicted after inactivity, which
// implicitly ends conversations. For MVP this is acceptable.

export function validateEditName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "Name cannot be empty.";
  return null;
}

export function validateEditPrice(priceStr: string): { price: number; error?: string } {
  const trimmed = priceStr.trim();
  const price = Number(trimmed);
  if (!Number.isFinite(price) || price < 0) {
    return { price: 0, error: "Enter a non-negative number." };
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
      error: "Use a 3-letter currency code such as EUR or USD.",
    };
  }
  return { currency: trimmed };
}

export function validateEditDate(dateStr: string): { date?: string; error?: string } {
  const trimmed = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { error: "Use YYYY-MM-DD, for example 2026-06-01." };
  }
  const parsed = new Date(trimmed + "T00:00:00Z");
  if (isNaN(parsed.getTime())) {
    return { error: "Invalid date. Use YYYY-MM-DD, for example 2026-06-01." };
  }
  return { date: trimmed };
}

export async function editFieldConversation(
  conversation: Conversation<BotContext, BaseBotContext>,
  ctx: BaseBotContext,
  subId: string,
  field: "name" | "price" | "currency" | "date"
): Promise<void> {
  // grammY conversations do not inherit custom middleware properties.
  // Read required fields from the outside context via external().
  const ctxData = await conversation.external((outsideCtx) => ({
    userKey: outsideCtx.userKey ?? null,
    encryptionKey: outsideCtx.env.ENCRYPTION_KEY,
    requestId: outsideCtx.requestId,
  }));

  if (!ctxData.userKey) {
    await ctx.reply("Unable to identify user. Please try again.");
    return;
  }

  const userKey = ctxData.userKey;
  const encryptionKey = ctxData.encryptionKey;
  const logger = createLogger(ctxData.requestId);

  const sub = await conversation.external(async (outsideCtx) => {
    const repo = createSubscriptionRepository(outsideCtx.env.SUBSCRIPTION_KV);
    const reminderRepo = createReminderRepository(outsideCtx.env.SUBSCRIPTION_KV);
    const service = createSubscriptionService(repo, reminderRepo);
    return service.get(userKey, subId, encryptionKey);
  });

  if (!sub) {
    await ctx.reply("Subscription not found or already deleted.");
    return;
  }

  const fieldLabels: Record<string, string> = {
    name: "name",
    price: "price",
    currency: "currency",
    date: "next billing date",
  };

  const promptMap: Record<string, string> = {
    name: `Current name: ${sub.name}\nSend the new name.`,
    price:
      sub.price !== undefined
        ? `Current price: ${sub.price}\nSend the new price (number).`
        : "No price set.\nSend a price (number).",
    currency:
      sub.currency !== undefined
        ? `Current currency: ${sub.currency}\nSend the new currency (3-letter code).`
        : "No currency set.\nSend a currency (3-letter code).",
    date: `Current next billing date: ${sub.nextBillingDate}\nSend the new date (YYYY-MM-DD).`,
  };

  await ctx.reply(promptMap[field]);

  const inputCtx = await conversation.waitFor("message:text");
  const input = inputCtx.msg.text;

  if (input.trim() === "/cancel") {
    await ctx.reply("Cancelled.");
    return;
  }

  const now = new Date().toISOString();
  const updated = { ...sub, updatedAt: now };

  if (field === "name") {
    const error = validateEditName(input);
    if (error) {
      await ctx.reply(error + "\nUse /edit to try again.");
      return;
    }
    updated.name = input.trim();
  } else if (field === "price") {
    const result = validateEditPrice(input);
    if (result.error) {
      await ctx.reply(result.error + "\nUse /edit to try again.");
      return;
    }
    updated.price = result.price;
  } else if (field === "currency") {
    const result = validateEditCurrency(input);
    if (result.error) {
      await ctx.reply(result.error + "\nUse /edit to try again.");
      return;
    }
    updated.currency = result.currency;
  } else if (field === "date") {
    const result = validateEditDate(input);
    if (result.error) {
      await ctx.reply(result.error + "\nUse /edit to try again.");
      return;
    }
    updated.nextBillingDate = result.date!;
  }

  await conversation.external(async (outsideCtx) => {
    const repo = createSubscriptionRepository(outsideCtx.env.SUBSCRIPTION_KV);
    const reminderRepo = createReminderRepository(outsideCtx.env.SUBSCRIPTION_KV);
    const service = createSubscriptionService(repo, reminderRepo);
    await service.update(userKey, updated, encryptionKey);
  });

  logger.info("Subscription field updated via conversation", {
    subId,
    field,
  });

  await ctx.reply(
    `Updated ${fieldLabels[field]} for "${updated.name}".\nUse /view to see the result.`
  );
}

export async function editCycleConversation(
  conversation: Conversation<BotContext, BaseBotContext>,
  ctx: BaseBotContext,
  subId: string
): Promise<void> {
  // grammY conversations do not inherit custom middleware properties.
  // Read required fields from the outside context via external().
  const ctxData = await conversation.external((outsideCtx) => ({
    userKey: outsideCtx.userKey ?? null,
    encryptionKey: outsideCtx.env.ENCRYPTION_KEY,
    requestId: outsideCtx.requestId,
  }));

  if (!ctxData.userKey) {
    await ctx.reply("Unable to identify user. Please try again.");
    return;
  }

  const userKey = ctxData.userKey;
  const encryptionKey = ctxData.encryptionKey;
  const logger = createLogger(ctxData.requestId);

  const sub = await conversation.external(async (outsideCtx) => {
    const repo = createSubscriptionRepository(outsideCtx.env.SUBSCRIPTION_KV);
    const reminderRepo = createReminderRepository(outsideCtx.env.SUBSCRIPTION_KV);
    const service = createSubscriptionService(repo, reminderRepo);
    return service.get(userKey, subId, encryptionKey);
  });

  if (!sub) {
    await ctx.reply("Subscription not found or already deleted.");
    return;
  }

  const cycleKeyboard = new InlineKeyboard()
    .text("Weekly", `editcycle:weekly:${subId}`)
    .text("Monthly", `editcycle:monthly:${subId}`)
    .text("Yearly", `editcycle:yearly:${subId}`)
    .text("Custom", `editcycle:custom:${subId}`);

  await ctx.reply("Choose the new billing cycle:", {
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
    const reminderRepo = createReminderRepository(outsideCtx.env.SUBSCRIPTION_KV);
    const service = createSubscriptionService(repo, reminderRepo);
    await service.update(userKey, updated, encryptionKey);
  });

  logger.info("Subscription cycle updated via conversation", { subId, cycle });

  await ctx.reply(
    `Updated cycle to ${cycle} for "${updated.name}".\nUse /view to see the result.`
  );
}
