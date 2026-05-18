import { Conversation } from "@grammyjs/conversations";
import { BotContext, BaseBotContext } from "../../types/context.js";
import { createSubscriptionService } from "../../services/subscriptionService.js";
import { createSubscriptionRepository } from "../../repositories/subscriptionRepository.js";
import { createReminderRepository } from "../../repositories/reminderRepository.js";
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
  parseAddPreviewCallbackData,
} from "../../utils/callbackParser.js";
import { formatBillingCycle } from "../../utils/labels.js";
import { getBillingAnchorDay, getNextBillingDate } from "../../utils/date.js";
import { parseBillingCycleText } from "../../utils/billingCycle.js";
import { ValidationError } from "../../utils/errors.js";

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
  "quarterly",
  "yearly",
  "custom",
  "interval",
];
const COMMON_CURRENCIES = [
  "CNY",
  "USD",
  "HKD",
  "TWD",
  "EUR",
  "JPY",
  "GBP",
  "SGD",
] as const;
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

export function validateAddCurrency(
  currencyStr: string,
  hasPrice: boolean,
): { currency?: string; error?: string } {
  const trimmed = currencyStr.trim().toUpperCase();
  if (trimmed === "SKIP" || trimmed === "") {
    if (hasPrice) {
      return { error: "已填写价格时必须选择币种。" };
    }
    return { currency: undefined };
  }
  if (!/^[A-Z]{3}$/.test(trimmed)) {
    return {
      error: "请输入 3 位币种代码，例如 CNY 或 USD。",
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

function currencyKeyboard(hasPrice: boolean): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  COMMON_CURRENCIES.forEach((currency, index) => {
    keyboard.text(currency, `addcurrency:${currency}`);
    if (index % 4 === 3) keyboard.row();
  });

  keyboard.text("其他", "addcurrency:other");
  if (!hasPrice) {
    keyboard.text("不填写", "addcurrency:skip");
  }
  keyboard.row().text("取消", "addcurrency:cancel");
  return keyboard;
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
    .text("‹", `adddate:month:${addMonthsToMonth(month, -1)}`)
    .text(`${year}年${monthNumber}月`, "adddate:noop")
    .text("›", `adddate:month:${addMonthsToMonth(month, 1)}`)
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

function confirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ 确认", "add:confirm")
    .text("❌ 取消", "add:cancel");
}

function billingPreviewKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ 正确，继续确认", "addpreview:confirm")
    .row()
    .text("↩️ 返回修改周期/日期", "addpreview:change")
    .row()
    .text("❌ 取消", "addpreview:cancel");
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
  const lines = [
    "未来扣款日期预览：",
    ...dates.map((date, index) => `${index + 1}. ${date}`),
  ];

  if (billingCycle === "custom") {
    lines.push("自定义周期不会自动推进，请之后手动修改下次扣款日期。");
  }

  lines.push("这个更新时间安排是否正确？");
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

  // Step 1: Name
  await ctx.reply("订阅名称是什么？");
  const nameCtx = await conversation.waitFor("message:text");
  const nameText = nameCtx.msg.text;
  if (isCancel(nameText)) {
    await ctx.reply("已取消。");
    return;
  }
  const nameError = validateAddName(nameText);
  if (nameError) {
    await ctx.reply(nameError + "\n请发送 /add 重新开始。");
    return;
  }
  const name = nameText.trim();

  // Step 2: Price
  await ctx.reply("价格是多少？请输入数字；如果不想填写价格，可以发送 skip。");
  const priceCtx = await conversation.waitFor("message:text");
  const priceText = priceCtx.msg.text;
  if (isCancel(priceText)) {
    await ctx.reply("已取消。");
    return;
  }
  const priceResult = validateAddPrice(priceText);
  if (priceResult.error) {
    await ctx.reply(priceResult.error + "\n请发送 /add 重新开始。");
    return;
  }
  const price = priceResult.price;

  // Step 3: Currency (inline keyboard)
  await ctx.reply("请选择币种：", {
    reply_markup: currencyKeyboard(price !== undefined),
  });

  let currency: string | undefined;
  let currencySelected = false;
  while (!currencySelected) {
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
      return;
    }

    if (parsedCurrency.action === "skip") {
      if (price !== undefined) {
        await ctx.reply("已填写价格时必须选择币种。");
        continue;
      }
      await safeDeleteMessage(currencyCtx);
      currency = undefined;
      currencySelected = true;
      break;
    }

    if (parsedCurrency.action === "other") {
      await safeDeleteMessage(currencyCtx);
      await ctx.reply("请输入 3 位币种代码，例如 CNY 或 USD。");
      const customCurrencyCtx = await conversation.waitFor("message:text");
      const customCurrencyText = customCurrencyCtx.msg.text;
      if (isCancel(customCurrencyText)) {
        await ctx.reply("已取消。");
        return;
      }
      const result = validateAddCurrency(
        customCurrencyText,
        price !== undefined,
      );
      if (result.error) {
        await ctx.reply(result.error + "\n请发送 /add 重新开始。");
        return;
      }
      currency = result.currency;
      currencySelected = true;
      break;
    }

    await safeDeleteMessage(currencyCtx);
    currency = parsedCurrency.currency;
    currencySelected = true;
    break;
  }

  let cycle: BillingCycle | undefined;
  let billingInterval: BillingInterval | undefined;
  let nextBillingDate: string | undefined;
  let previewConfirmed = false;

  while (!previewConfirmed) {
    // Step 4: Billing cycle (inline keyboard)
    await ctx.reply("请选择扣款周期：", {
      reply_markup: cycleKeyboard(),
    });
    const cycleCtx = await conversation.waitForCallbackQuery(/^cycle:/);
    const cycleCallback = cycleCtx.callbackQuery.data;
    const selectedCycle = cycleCallback.replace("cycle:", "") as BillingCycle;
    if (!VALID_CYCLES.includes(selectedCycle)) {
      await ctx.reply("请点击按钮选择扣款周期。\n请发送 /add 重新开始。");
      return;
    }
    await cycleCtx.answerCallbackQuery();
    await safeDeleteMessage(cycleCtx);
    cycle = selectedCycle;
    billingInterval = undefined;

    if (selectedCycle === "interval") {
      await ctx.reply(
        "请输入间隔，例如 every 30 days、every 4 weeks、6m、2y、30d、4w、每30天、每4周、每6个月、每2年。",
      );
      const intervalCtx = await conversation.waitFor("message:text");
      const intervalText = intervalCtx.msg.text;
      if (isCancel(intervalText)) {
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
          await ctx.reply(err.message + "\n请发送 /add 重新开始。");
          return;
        }
        throw err;
      }
    }

    // Step 5: Date (inline calendar)
    await ctx.reply("请选择下次扣款日期：", {
      reply_markup: dateKeyboard(currentMonth()),
    });

    nextBillingDate = undefined;
    while (!nextBillingDate) {
      const dateCtx = await conversation.waitForCallbackQuery(/^adddate:/);
      const parsedDate = parseAddDateCallbackData(dateCtx.callbackQuery.data);

      if (!parsedDate) {
        await dateCtx.answerCallbackQuery("无效的日期选择。");
        continue;
      }

      if (parsedDate.action === "noop") {
        await dateCtx.answerCallbackQuery();
        continue;
      }

      if (parsedDate.action === "cancel") {
        await dateCtx.answerCallbackQuery();
        await safeDeleteMessage(dateCtx);
        await ctx.reply("已取消。");
        return;
      }

      if (parsedDate.action === "month") {
        await dateCtx.answerCallbackQuery();
        try {
          await dateCtx.editMessageReplyMarkup({
            reply_markup: dateKeyboard(parsedDate.month),
          });
        } catch {
          // If editing fails, keep the conversation alive for the next callback.
        }
        continue;
      }

      const dateResult = validateAddDate(parsedDate.date);
      if (dateResult.error) {
        await dateCtx.answerCallbackQuery("日期无效。");
        await ctx.reply(dateResult.error + "\n请发送 /add 重新开始。");
        return;
      }

      await dateCtx.answerCallbackQuery();
      await safeDeleteMessage(dateCtx);
      nextBillingDate = dateResult.date!;
    }

    await ctx.reply(
      formatBillingDatePreview(nextBillingDate, cycle, billingInterval),
      {
        reply_markup: billingPreviewKeyboard(),
      },
    );

    const previewCtx = await conversation.waitForCallbackQuery(/^addpreview:/);
    const parsedPreview = parseAddPreviewCallbackData(
      previewCtx.callbackQuery.data,
    );
    await previewCtx.answerCallbackQuery();
    await safeDeleteMessage(previewCtx);

    if (!parsedPreview || parsedPreview.action === "cancel") {
      await ctx.reply("已取消。");
      return;
    }

    if (parsedPreview.action === "change") {
      continue;
    }

    previewConfirmed = true;
  }

  if (!cycle || !nextBillingDate) {
    await ctx.reply("已取消。");
    return;
  }

  // Review
  const reviewLines = [
    "请确认订阅信息：",
    `名称：${name}`,
    price !== undefined ? `价格：${price} ${currency ?? ""}`.trim() : null,
    `周期：${formatBillingCycle(cycle, billingInterval)}`,
    `下次扣款：${nextBillingDate}`,
  ].filter((l): l is string => l !== null);

  await ctx.reply(reviewLines.join("\n"), {
    reply_markup: confirmKeyboard(),
  });

  const confirmCtx = await conversation.waitForCallbackQuery(/^add:/);
  const confirmAction = confirmCtx.callbackQuery.data;
  await confirmCtx.answerCallbackQuery();
  await safeDeleteMessage(confirmCtx);

  if (confirmAction === "add:cancel") {
    await ctx.reply("已取消。");
    logger.info("Add conversation cancelled at review");
    return;
  }

  if (confirmAction !== "add:confirm") {
    await ctx.reply("已取消。");
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
    billingInterval,
    nextBillingDate,
    billingAnchorDay: getBillingAnchorDay(nextBillingDate),
    status: "active",
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
    `✅ 已添加“${name}”。\n短 ID：${shortId(sub.id)}\n发送 /list 查看全部订阅。`,
  );
}
