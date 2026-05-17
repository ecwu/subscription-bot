import { Conversation } from "@grammyjs/conversations";
import { BotContext, BaseBotContext } from "../../types/context.js";
import { createSubscriptionService } from "../../services/subscriptionService.js";
import { createSubscriptionRepository } from "../../repositories/subscriptionRepository.js";
import { createReminderRepository } from "../../repositories/reminderRepository.js";
import { Subscription, BillingCycle } from "../../models/subscription.js";
import { shortId } from "../../utils/shortId.js";
import { createLogger } from "../../utils/logger.js";
import { InlineKeyboard } from "grammy";

// TODO: grammY conversations do not have built-in timeout handling.
// If a user starts /add and never completes it, the conversation waits
// indefinitely until the isolate is recycled or the user sends /cancel.
// On Cloudflare Workers, isolates may be evicted after a period of
// inactivity, which implicitly ends conversations. For MVP this is
// acceptable; a future enhancement could track conversation start
// timestamps and auto-exit stale ones.

// Validation helpers
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const VALID_CYCLES: readonly BillingCycle[] = [
  "weekly",
  "monthly",
  "yearly",
  "custom",
];

export function validateAddName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "Name cannot be empty.";
  return null;
}

export function validateAddPrice(priceStr: string): {
  price?: number;
  error?: string;
} {
  const trimmed = priceStr.trim().toLowerCase();
  if (trimmed === "skip" || trimmed === "") {
    return { price: undefined };
  }
  const price = Number(trimmed);
  if (!Number.isFinite(price) || price < 0) {
    return { error: "Enter a non-negative number, or type skip." };
  }
  return { price };
}

export function validateAddCurrency(
  currencyStr: string,
  hasPrice: boolean,
): { currency?: string; error?: string } {
  const trimmed = currencyStr.trim().toUpperCase();
  if (trimmed === "SKIP" || trimmed === "") {
    if (hasPrice) {
      return { error: "Currency is required when a price is set." };
    }
    return { currency: undefined };
  }
  if (!/^[A-Z]{3}$/.test(trimmed)) {
    return {
      error: "Use a 3-letter currency code such as EUR or USD.",
    };
  }
  return { currency: trimmed };
}

export function validateAddDate(dateStr: string): {
  date?: string;
  error?: string;
} {
  const trimmed = dateStr.trim();
  if (!DATE_REGEX.test(trimmed)) {
    return { error: "Use YYYY-MM-DD, for example 2026-06-01." };
  }
  const parsed = new Date(trimmed + "T00:00:00Z");
  if (isNaN(parsed.getTime())) {
    return { error: "Invalid date. Use YYYY-MM-DD, for example 2026-06-01." };
  }
  return { date: trimmed };
}

function cycleKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Weekly", "cycle:weekly")
    .text("Monthly", "cycle:monthly")
    .text("Yearly", "cycle:yearly")
    .text("Custom", "cycle:custom");
}

function confirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Confirm", "add:confirm")
    .text("❌ Cancel", "add:cancel");
}

function isCancel(text: string): boolean {
  return text.trim() === "/cancel";
}

export async function addConversation(
  conversation: Conversation<BotContext, BaseBotContext>,
  ctx: BaseBotContext,
): Promise<void> {
  // grammY conversations create fresh context objects that do not inherit
  // custom properties from outside middleware. We must read userKey, env,
  // and requestId via conversation.external() which gives us access to the
  // outside context from the current middleware pass.
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

  // Step 1: Name
  await ctx.reply("What is the subscription name?");
  const nameCtx = await conversation.waitFor("message:text");
  const nameText = nameCtx.msg.text;
  if (isCancel(nameText)) {
    await ctx.reply("Cancelled.");
    return;
  }
  const nameError = validateAddName(nameText);
  if (nameError) {
    await ctx.reply(nameError + "\nUse /add to try again.");
    return;
  }
  const name = nameText.trim();

  // Step 2: Price
  await ctx.reply("What is the price? You can type a number, or type skip.");
  const priceCtx = await conversation.waitFor("message:text");
  const priceText = priceCtx.msg.text;
  if (isCancel(priceText)) {
    await ctx.reply("Cancelled.");
    return;
  }
  const priceResult = validateAddPrice(priceText);
  if (priceResult.error) {
    await ctx.reply(priceResult.error + "\nUse /add to try again.");
    return;
  }
  const price = priceResult.price;

  // Step 3: Currency
  await ctx.reply("What currency? Example: EUR, USD, GBP. You can type skip.");
  const currencyCtx = await conversation.waitFor("message:text");
  const currencyText = currencyCtx.msg.text;
  if (isCancel(currencyText)) {
    await ctx.reply("Cancelled.");
    return;
  }
  const currencyResult = validateAddCurrency(currencyText, price !== undefined);
  if (currencyResult.error) {
    await ctx.reply(currencyResult.error + "\nUse /add to try again.");
    return;
  }
  const currency = currencyResult.currency;

  // Step 4: Billing cycle (inline keyboard)
  await ctx.reply("Choose billing cycle:", {
    reply_markup: cycleKeyboard(),
  });
  const cycleCtx = await conversation.waitForCallbackQuery(/^cycle:/);
  const cycleCallback = cycleCtx.callbackQuery.data;
  const cycle = cycleCallback.replace("cycle:", "") as BillingCycle;
  if (!VALID_CYCLES.includes(cycle)) {
    await ctx.reply("Choose one of the buttons.\nUse /add to try again.");
    return;
  }
  await cycleCtx.answerCallbackQuery();
  await cycleCtx.deleteMessage();

  // Step 5: Date
  await ctx.reply("What is the next billing date? Use YYYY-MM-DD.");
  const dateCtx = await conversation.waitFor("message:text");
  const dateText = dateCtx.msg.text;
  if (isCancel(dateText)) {
    await ctx.reply("Cancelled.");
    return;
  }
  const dateResult = validateAddDate(dateText);
  if (dateResult.error) {
    await ctx.reply(dateResult.error + "\nUse /add to try again.");
    return;
  }
  const nextBillingDate = dateResult.date!;

  // Review
  const reviewLines = [
    "Review:",
    `Name: ${name}`,
    price !== undefined ? `Price: ${price} ${currency ?? ""}`.trim() : null,
    `Cycle: ${cycle}`,
    `Next billing: ${nextBillingDate}`,
  ].filter((l): l is string => l !== null);

  await ctx.reply(reviewLines.join("\n"), {
    reply_markup: confirmKeyboard(),
  });

  const confirmCtx = await conversation.waitForCallbackQuery(/^add:/);
  const confirmAction = confirmCtx.callbackQuery.data;
  await confirmCtx.answerCallbackQuery();
  await confirmCtx.deleteMessage();

  if (confirmAction === "add:cancel") {
    await ctx.reply("Cancelled.");
    logger.info("Add conversation cancelled at review");
    return;
  }

  if (confirmAction !== "add:confirm") {
    await ctx.reply("Cancelled.");
    return;
  }

  // Save
  const now = new Date().toISOString();
  const sub: Subscription = {
    id: crypto.randomUUID(),
    name,
    price,
    currency,
    billingCycle: cycle,
    nextBillingDate,
    createdAt: now,
    updatedAt: now,
  };

  await conversation.external(async (outsideCtx) => {
    const repo = createSubscriptionRepository(outsideCtx.env.SUBSCRIPTION_KV);
    const reminderRepo = createReminderRepository(
      outsideCtx.env.SUBSCRIPTION_KV,
    );
    const service = createSubscriptionService(repo, reminderRepo);
    await service.create(userKey, sub, encryptionKey);
  });

  logger.info("Subscription created via conversation", {
    subId: sub.id,
    shortId: shortId(sub.id),
  });

  await ctx.reply(
    `✅ "${name}" added.\nShort ID: ${shortId(sub.id)}\nUse /list to see all subscriptions.`,
  );
}
