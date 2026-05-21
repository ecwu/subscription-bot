import { Conversation } from "@grammyjs/conversations";
import { BotContext, BaseBotContext } from "../../types/context.js";
import { createSubscriptionService } from "../../services/subscriptionService.js";
import { createSubscriptionRepository } from "../../repositories/subscriptionRepository.js";
import { createReminderRepository } from "../../repositories/reminderRepository.js";
import { createUserRepository } from "../../repositories/userRepository.js";
import {
  Subscription,
  BillingCycle,
  BillingInterval,
} from "../../models/subscription.js";
import { shortId } from "../../utils/shortId.js";
import { createLogger } from "../../utils/logger.js";
import { InlineKeyboard } from "grammy";
import { parseAddConfirmCallbackData } from "../../utils/callbackParser.js";
import { formatBillingCycle } from "../../utils/labels.js";
import { getBillingAnchorDay, getNextBillingDate } from "../../utils/date.js";
import { validateCurrencyInput } from "../../utils/currency.js";
import { isCancelInput } from "../../utils/conversationInput.js";
import {
  collectDateInput,
  dateKeyboard,
  validateDateInput,
} from "./dateInput.js";
import { collectCurrencyInput } from "./currencyInput.js";
import { collectCycleInput, CycleSelection } from "./cycleInput.js";
import { binaryActionKeyboard } from "../keyboards/confirmationKeyboard.js";

// TODO: grammY conversations do not have built-in timeout handling.
// If a user starts /add and never completes it, the conversation waits
// indefinitely until the isolate is recycled or the user sends /cancel.
// On Cloudflare Workers, isolates may be evicted after a period of
// inactivity, which implicitly ends conversations. For MVP this is
// acceptable; a future enhancement could track conversation start
// timestamps and auto-exit stale ones.

export const validateAddCurrency = validateCurrencyInput;

export function validateAddName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "订阅名称不能为空。";
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
    return { error: "请输入非负数字，或发送 skip 跳过。" };
  }
  return { price };
}

export function validateAddDate(dateStr: string): {
  date?: string;
  error?: string;
} {
  return validateDateInput(dateStr);
}

export { dateKeyboard };

function confirmKeyboard(): InlineKeyboard {
  return binaryActionKeyboard({
    confirmData: "add:confirm",
    cancelData: "add:cancel",
  });
}

function reviewKeyboard(price?: number): InlineKeyboard {
  const keyboard = confirmKeyboard()
    .row()
    .text("自动续费", "add:toggle_autorenew")
    .text("体验", "add:toggle_trial")
    .row()
    .text("名称", "add:edit_name")
    .text("价格", "add:edit_price")
    .row();

  if (price !== undefined) {
    keyboard.text("币种", "add:edit_currency");
  }

  return keyboard
    .text("周期", "add:edit_cycle")
    .row()
    .text("日期", "add:edit_date");
}

export function resolveAddCurrencyForPrice(
  price: number | undefined,
  explicitDefaultCurrency?: string,
): { currency?: string; shouldAskCurrency: boolean } {
  if (price === undefined) {
    return { currency: undefined, shouldAskCurrency: false };
  }
  if (explicitDefaultCurrency) {
    return {
      currency: explicitDefaultCurrency,
      shouldAskCurrency: false,
    };
  }
  return { currency: undefined, shouldAskCurrency: true };
}

function buildReviewMessage(draft: AddDraft): string {
  const lines = [
    "请确认订阅信息：",
    `名称：${draft.name}`,
    draft.price !== undefined
      ? `价格：${draft.price} ${draft.currency ?? ""}`.trim()
      : "价格：未填写",
    `周期：${formatBillingCycle(draft.cycle, draft.billingInterval)}`,
    `类型：${draft.isTrial ? "体验" : "付费"}`,
    `自动续费：${draft.autoRenew ? "是" : "否"}`,
    `${draft.isTrial ? "体验到期/首次扣款" : draft.autoRenew ? "下次扣款" : "服务到期"}：${draft.nextBillingDate}`,
    "",
    formatBillingDatePreview(
      draft.nextBillingDate,
      draft.cycle,
      draft.billingInterval,
    ),
  ];

  return lines.join("\n");
}

interface AddDraft {
  name: string;
  price?: number;
  currency?: string;
  cycle: BillingCycle;
  billingInterval?: BillingInterval;
  nextBillingDate: string;
  isTrial: boolean;
  autoRenew: boolean;
}

export function buildBillingDatePreview(
  nextBillingDate: string,
  billingCycle: BillingCycle,
  billingAnchorDay = getBillingAnchorDay(nextBillingDate),
  count = 5,
  billingInterval?: BillingInterval,
): string[] {
  const dates = [nextBillingDate];
  let currentDate = nextBillingDate;

  while (dates.length < count) {
    const nextDate = getNextBillingDate(
      currentDate,
      billingCycle,
      billingAnchorDay,
      billingInterval,
    );
    if (!nextDate) break;
    dates.push(nextDate);
    currentDate = nextDate;
  }

  return dates;
}

export function formatBillingDatePreview(
  nextBillingDate: string,
  billingCycle: BillingCycle,
  billingInterval?: BillingInterval,
): string {
  const dates = buildBillingDatePreview(
    nextBillingDate,
    billingCycle,
    getBillingAnchorDay(nextBillingDate),
    5,
    billingInterval,
  );
  const cycleLabel = formatBillingCycle(billingCycle, billingInterval);
  const lines = [
    `周期：${cycleLabel}`,
    "未来扣款日期预览：",
    ...dates.map((date, index) => `${index + 1}. ${date}`),
  ];

  if (billingCycle === "custom") {
    lines.push("自定义周期不会自动推进，请之后手动修改下次扣款日期。");
  }

  return lines.join("\n");
}

async function safeDeleteMessage(ctx: BaseBotContext): Promise<void> {
  try {
    await ctx.deleteMessage();
  } catch {
    // The callback message may already be gone.
  }
}

async function collectCurrencyForPrice(
  conversation: Conversation<BotContext, BaseBotContext>,
  ctx: BaseBotContext,
  price: number | undefined,
  explicitDefaultCurrency?: string,
): Promise<{ currency?: string; cancelled: boolean }> {
  const resolved = resolveAddCurrencyForPrice(price, explicitDefaultCurrency);
  if (!resolved.shouldAskCurrency) {
    return { currency: resolved.currency, cancelled: false };
  }

  return collectCurrencyInput(conversation, ctx, {
    hasPrice: true,
    restartHint: "\n请发送 /add 重新开始。",
  });
}

async function collectName(
  conversation: Conversation<BotContext, BaseBotContext>,
  ctx: BaseBotContext,
  prompt: string,
): Promise<string | null> {
  await ctx.reply(prompt);
  const nameCtx = await conversation.waitFor("message:text");
  const nameText = nameCtx.msg.text;
  if (isCancelInput(nameText)) {
    await ctx.reply("已取消。");
    return null;
  }
  const nameError = validateAddName(nameText);
  if (nameError) {
    await ctx.reply(nameError + "\n请发送 /add 重新开始。");
    return null;
  }
  return nameText.trim();
}

async function collectPrice(
  conversation: Conversation<BotContext, BaseBotContext>,
  ctx: BaseBotContext,
): Promise<{ price?: number; cancelled: boolean }> {
  await ctx.reply("价格是多少？请输入数字；如果不想填写价格，可以发送 skip。");
  const priceCtx = await conversation.waitFor("message:text");
  const priceText = priceCtx.msg.text;
  if (isCancelInput(priceText)) {
    await ctx.reply("已取消。");
    return { cancelled: true };
  }
  const priceResult = validateAddPrice(priceText);
  if (priceResult.error) {
    await ctx.reply(priceResult.error + "\n请发送 /add 重新开始。");
    return { cancelled: true };
  }
  return { price: priceResult.price, cancelled: false };
}

async function collectCycle(
  conversation: Conversation<BotContext, BaseBotContext>,
  ctx: BaseBotContext,
): Promise<CycleSelection | null> {
  return collectCycleInput(conversation, ctx, {
    callbackPattern: /^cycle:/,
    callbackData: (cycle) => `cycle:${cycle}`,
    parseCycle: (callbackData) => callbackData.replace("cycle:", ""),
    invalidSelectionMessage: "请点击按钮选择扣款周期。\n请发送 /add 重新开始。",
    restartHint: "\n请发送 /add 重新开始。",
  });
}

async function collectDate(
  conversation: Conversation<BotContext, BaseBotContext>,
  ctx: BaseBotContext,
): Promise<string | null> {
  return collectDateInput(conversation, ctx, "请选择或输入下次扣款日期：");
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
    await ctx.reply("无法识别用户，请稍后再试。");
    return;
  }

  const userKey = ctxData.userKey;
  const encryptionKey = ctxData.encryptionKey;
  const logger = createLogger(ctxData.requestId);

  const explicitDefaultCurrency = await conversation.external(
    async (outsideCtx) => {
      const repo = createUserRepository(outsideCtx.env.SUBSCRIPTION_KV);
      const profile = await repo.getUserProfile(userKey, encryptionKey);
      return profile?.settings?.defaultCurrency;
    },
  );

  const name = await collectName(conversation, ctx, "订阅名称是什么？");
  if (!name) {
    return;
  }

  const priceSelection = await collectPrice(conversation, ctx);
  if (priceSelection.cancelled) {
    return;
  }

  const currencySelection = await collectCurrencyForPrice(
    conversation,
    ctx,
    priceSelection.price,
    explicitDefaultCurrency,
  );
  if (currencySelection.cancelled) {
    return;
  }

  const cycleSelection = await collectCycle(conversation, ctx);
  if (!cycleSelection) {
    return;
  }

  const dateSelection = await collectDate(conversation, ctx);
  if (!dateSelection) {
    return;
  }

  const draft: AddDraft = {
    name,
    price: priceSelection.price,
    currency: currencySelection.currency,
    cycle: cycleSelection.cycle,
    billingInterval: cycleSelection.billingInterval,
    nextBillingDate: dateSelection,
    isTrial: false,
    autoRenew: true,
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    await ctx.reply(buildReviewMessage(draft), {
      reply_markup: reviewKeyboard(draft.price),
    });

    const reviewCtx = await conversation.waitForCallbackQuery(/^add:/);
    const parsedReview = parseAddConfirmCallbackData(
      reviewCtx.callbackQuery.data,
    );
    await reviewCtx.answerCallbackQuery();
    await safeDeleteMessage(reviewCtx);

    if (!parsedReview) {
      await ctx.reply("无效的选择，请重新确认。");
      continue;
    }

    if (parsedReview.action === "cancel") {
      await ctx.reply("已取消。");
      logger.info("Add conversation cancelled at review");
      return;
    }

    if (parsedReview.action === "confirm") {
      break;
    }

    if (parsedReview.action === "toggle_trial") {
      draft.isTrial = !draft.isTrial;
      continue;
    }

    if (parsedReview.action === "toggle_autorenew") {
      draft.autoRenew = !draft.autoRenew;
      continue;
    }

    if (parsedReview.action === "edit_name") {
      const updatedName = await collectName(
        conversation,
        ctx,
        "请发送新的订阅名称：",
      );
      if (!updatedName) return;
      draft.name = updatedName;
      continue;
    }

    if (parsedReview.action === "edit_price") {
      const updatedPrice = await collectPrice(conversation, ctx);
      if (updatedPrice.cancelled) return;
      draft.price = updatedPrice.price;
      const updatedCurrency = await collectCurrencyForPrice(
        conversation,
        ctx,
        draft.price,
        explicitDefaultCurrency,
      );
      if (updatedCurrency.cancelled) return;
      draft.currency = updatedCurrency.currency;
      continue;
    }

    if (parsedReview.action === "edit_currency") {
      if (draft.price === undefined) {
        await ctx.reply("未填写价格时不需要币种。");
        draft.currency = undefined;
        continue;
      }
      const updatedCurrency = await collectCurrencyInput(conversation, ctx, {
        hasPrice: true,
        restartHint: "\n请发送 /add 重新开始。",
      });
      if (updatedCurrency.cancelled) return;
      draft.currency = updatedCurrency.currency;
      continue;
    }

    if (parsedReview.action === "edit_cycle") {
      const updatedCycle = await collectCycle(conversation, ctx);
      if (!updatedCycle) return;
      draft.cycle = updatedCycle.cycle;
      draft.billingInterval = updatedCycle.billingInterval;
      continue;
    }

    if (parsedReview.action === "edit_date") {
      const updatedDate = await collectDate(conversation, ctx);
      if (!updatedDate) return;
      draft.nextBillingDate = updatedDate;
      continue;
    }
  }

  // Save
  const now = new Date().toISOString();
  const sub: Subscription = {
    id: crypto.randomUUID(),
    name: draft.name,
    price: draft.price,
    currency: draft.currency,
    billingCycle: draft.cycle,
    billingInterval: draft.billingInterval,
    nextBillingDate: draft.nextBillingDate,
    billingAnchorDay: getBillingAnchorDay(draft.nextBillingDate),
    status: "active",
    isTrial: draft.isTrial,
    autoRenew: draft.autoRenew,
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
    `✅ 已添加“${draft.name}”。\n短 ID：${shortId(sub.id)}\n发送 /list 查看全部订阅。`,
  );
}
