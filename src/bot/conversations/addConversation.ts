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
import {
  parseAddCurrencyCallbackData,
  parseAddDateCallbackData,
  parseAddConfirmCallbackData,
} from "../../utils/callbackParser.js";
import { formatBillingCycle } from "../../utils/labels.js";
import { getBillingAnchorDay, getNextBillingDate } from "../../utils/date.js";
import { parseBillingCycleText } from "../../utils/billingCycle.js";
import { parseFlexibleDate } from "../../utils/parseDate.js";
import { ValidationError } from "../../utils/errors.js";
import {
  currencyKeyboard,
  validateCurrencyInput,
} from "../../utils/currency.js";

// TODO: grammY conversations do not have built-in timeout handling.
// If a user starts /add and never completes it, the conversation waits
// indefinitely until the isolate is recycled or the user sends /cancel.
// On Cloudflare Workers, isolates may be evicted after a period of
// inactivity, which implicitly ends conversations. For MVP this is
// acceptable; a future enhancement could track conversation start
// timestamps and auto-exit stale ones.

// Validation helpers
const VALID_CYCLES: readonly BillingCycle[] = [
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
  "custom",
  "interval",
];

export const validateAddCurrency = validateCurrencyInput;
const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

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
  return parseFlexibleDate(dateStr);
}

function cycleKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("每周", "cycle:weekly")
    .text("每月", "cycle:monthly")
    .row()
    .text("每季度", "cycle:quarterly")
    .text("每年", "cycle:yearly")
    .row()
    .text("自定义", "cycle:custom")
    .text("高级间隔", "cycle:interval");
}

function addMonthsToMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}`;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatDateValue(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0",
  )}`;
}

export function dateKeyboard(month: string): InlineKeyboard {
  const [year, monthNumber] = month.split("-").map(Number);
  const keyboard = new InlineKeyboard()
    .text("« 上一年", `adddate:month:${addMonthsToMonth(month, -12)}`)
    .text("‹ 上月", `adddate:month:${addMonthsToMonth(month, -1)}`)
    .text(`${year}年${monthNumber}月`, "adddate:noop")
    .text("下月 ›", `adddate:month:${addMonthsToMonth(month, 1)}`)
    .text("下一年 »", `adddate:month:${addMonthsToMonth(month, 12)}`)
    .row();

  for (const label of WEEKDAY_LABELS) {
    keyboard.text(label, "adddate:noop");
  }
  keyboard.row();

  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1));
  const startOffset = (firstDay.getUTCDay() + 6) % 7;
  const totalDays = daysInMonth(year, monthNumber);
  let day = 1;

  for (let week = 0; week < 6; week++) {
    for (let weekday = 0; weekday < 7; weekday++) {
      if ((week === 0 && weekday < startOffset) || day > totalDays) {
        keyboard.text(" ", "adddate:noop");
      } else {
        keyboard.text(
          String(day),
          `adddate:pick:${formatDateValue(year, monthNumber, day)}`,
        );
        day += 1;
      }
    }
    keyboard.row();
    if (day > totalDays) break;
  }

  keyboard.text(
    "今天",
    `adddate:pick:${new Date().toISOString().slice(0, 10)}`,
  );
  keyboard.text("取消", "adddate:cancel");
  return keyboard;
}

function collapsedDateKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("选择日期", "adddate:show")
    .text("取消", "adddate:cancel");
}

function confirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ 确认", "add:confirm")
    .text("❌ 取消", "add:cancel");
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

interface CycleSelection {
  cycle: BillingCycle;
  billingInterval?: BillingInterval;
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

function isCancel(text: string): boolean {
  return text.trim() === "/cancel" || text.trim() === "取消";
}

async function safeDeleteMessage(ctx: BaseBotContext): Promise<void> {
  try {
    await ctx.deleteMessage();
  } catch {
    // The callback message may already be gone.
  }
}

async function promptForCurrency(
  conversation: Conversation<BotContext, BaseBotContext>,
  ctx: BaseBotContext,
): Promise<string | null> {
  await ctx.reply("请选择币种：", {
    reply_markup: currencyKeyboard(true),
  });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const currencyCtx =
      await conversation.waitForCallbackQuery(/^addcurrency:/);
    const parsedCurrency = parseAddCurrencyCallbackData(
      currencyCtx.callbackQuery.data,
    );

    if (!parsedCurrency) {
      await currencyCtx.answerCallbackQuery("无效的币种选择。");
      continue;
    }

    await currencyCtx.answerCallbackQuery();

    if (parsedCurrency.action === "cancel") {
      await safeDeleteMessage(currencyCtx);
      await ctx.reply("已取消。");
      return null;
    }

    if (parsedCurrency.action === "skip") {
      await ctx.reply("已填写价格时必须选择币种。");
      continue;
    }

    if (parsedCurrency.action === "other") {
      await safeDeleteMessage(currencyCtx);
      await ctx.reply("请输入 3 位币种代码，例如 CNY 或 USD。");
      const customCurrencyCtx = await conversation.waitFor("message:text");
      const customCurrencyText = customCurrencyCtx.msg.text;
      if (isCancel(customCurrencyText)) {
        await ctx.reply("已取消。");
        return null;
      }
      const result = validateAddCurrency(customCurrencyText, true);
      if (result.error || !result.currency) {
        await ctx.reply(
          (result.error ?? "请输入有效的币种代码。") +
            "\n请发送 /add 重新开始。",
        );
        return null;
      }
      return result.currency;
    }

    await safeDeleteMessage(currencyCtx);
    return parsedCurrency.currency;
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

  const currency = await promptForCurrency(conversation, ctx);
  if (!currency) return { cancelled: true };
  return { currency, cancelled: false };
}

async function collectName(
  conversation: Conversation<BotContext, BaseBotContext>,
  ctx: BaseBotContext,
  prompt: string,
): Promise<string | null> {
  await ctx.reply(prompt);
  const nameCtx = await conversation.waitFor("message:text");
  const nameText = nameCtx.msg.text;
  if (isCancel(nameText)) {
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
  if (isCancel(priceText)) {
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
  await ctx.reply("请选择扣款周期：", {
    reply_markup: cycleKeyboard(),
  });
  const cycleCtx = await conversation.waitForCallbackQuery(/^cycle:/);
  const cycleCallback = cycleCtx.callbackQuery.data;
  const selectedCycle = cycleCallback.replace("cycle:", "") as BillingCycle;
  if (!VALID_CYCLES.includes(selectedCycle)) {
    await ctx.reply("请点击按钮选择扣款周期。\n请发送 /add 重新开始。");
    return null;
  }
  await cycleCtx.answerCallbackQuery();
  await safeDeleteMessage(cycleCtx);

  if (selectedCycle !== "interval") {
    return { cycle: selectedCycle };
  }

  await ctx.reply(
    "请输入间隔，例如 every 30 days、every 4 weeks、6m、2y、30d、4w、每30天、每4周、每6个月、每2年。",
  );
  const intervalCtx = await conversation.waitFor("message:text");
  const intervalText = intervalCtx.msg.text;
  if (isCancel(intervalText)) {
    await ctx.reply("已取消。");
    return null;
  }
  try {
    const parsedCycle = parseBillingCycleText(intervalText);
    if (
      parsedCycle.billingCycle !== "interval" ||
      !parsedCycle.billingInterval
    ) {
      await ctx.reply("请输入高级间隔，例如 30d、4w、6m 或 2y。");
      return null;
    }
    return {
      cycle: parsedCycle.billingCycle,
      billingInterval: parsedCycle.billingInterval,
    };
  } catch (err) {
    if (err instanceof ValidationError) {
      await ctx.reply(err.message + "\n请发送 /add 重新开始。");
      return null;
    }
    throw err;
  }
}

async function collectDate(
  conversation: Conversation<BotContext, BaseBotContext>,
  ctx: BaseBotContext,
): Promise<string | null> {
  const promptMsg = await ctx.reply("请选择或输入下次扣款日期：", {
    reply_markup: collapsedDateKeyboard(),
  });

  let calendarMonth = currentMonth();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const updateCtx = await conversation.wait();

    if (updateCtx.message?.text) {
      const text = updateCtx.message.text;
      if (isCancel(text)) {
        try {
          await ctx.api.deleteMessage(promptMsg.chat.id, promptMsg.message_id);
        } catch {
          // The message may already be gone.
        }
        await ctx.reply("已取消。");
        return null;
      }
      const result = validateAddDate(text);
      if (result.error) {
        await ctx.reply(
          result.error + "\n请重新输入日期，或点击「选择日期」使用日历选择：",
        );
        continue;
      }
      try {
        await ctx.api.deleteMessage(promptMsg.chat.id, promptMsg.message_id);
      } catch {
        // The message may already be gone.
      }
      return result.date!;
    }

    if (!updateCtx.callbackQuery?.data) continue;

    const parsedDate = parseAddDateCallbackData(updateCtx.callbackQuery.data);

    if (!parsedDate) {
      await updateCtx.answerCallbackQuery("无效的日期选择。");
      continue;
    }

    if (parsedDate.action === "show") {
      await updateCtx.answerCallbackQuery();
      try {
        await updateCtx.editMessageReplyMarkup({
          reply_markup: dateKeyboard(calendarMonth),
        });
      } catch {
        // If editing fails, keep the conversation alive.
      }
      continue;
    }

    if (parsedDate.action === "noop") {
      await updateCtx.answerCallbackQuery();
      continue;
    }

    if (parsedDate.action === "cancel") {
      await updateCtx.answerCallbackQuery();
      await safeDeleteMessage(updateCtx);
      await ctx.reply("已取消。");
      return null;
    }

    if (parsedDate.action === "month") {
      await updateCtx.answerCallbackQuery();
      calendarMonth = parsedDate.month;
      try {
        await updateCtx.editMessageReplyMarkup({
          reply_markup: dateKeyboard(parsedDate.month),
        });
      } catch {
        // If editing fails, keep the conversation alive for the next callback.
      }
      continue;
    }

    const dateResult = validateAddDate(parsedDate.date);
    if (dateResult.error) {
      await updateCtx.answerCallbackQuery("日期无效。");
      await ctx.reply(dateResult.error + "\n请发送 /add 重新开始。");
      return null;
    }

    await updateCtx.answerCallbackQuery();
    await safeDeleteMessage(updateCtx);
    return dateResult.date!;
  }
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
      const updatedCurrency = await promptForCurrency(conversation, ctx);
      if (!updatedCurrency) return;
      draft.currency = updatedCurrency;
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
