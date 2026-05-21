import { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import { BotContext, BaseBotContext } from "../../types/context.js";
import { parseAddDateCallbackData } from "../../utils/callbackParser.js";
import { isCancelInput } from "../../utils/conversationInput.js";
import { parseFlexibleDate } from "../../utils/parseDate.js";

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

export function validateDateInput(dateStr: string): {
  date?: string;
  error?: string;
} {
  return parseFlexibleDate(dateStr);
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

async function safeDeleteMessage(ctx: BaseBotContext): Promise<void> {
  try {
    await ctx.deleteMessage();
  } catch {
    // The callback message may already be gone.
  }
}

export async function collectDateInput(
  conversation: Conversation<BotContext, BaseBotContext>,
  ctx: BaseBotContext,
  prompt: string,
  options?: {
    confirmTexts?: readonly string[];
    confirmValue?: string;
    cancelMessage?: string;
  },
): Promise<string | null> {
  const promptMsg = await ctx.reply(prompt, {
    reply_markup: collapsedDateKeyboard(),
  });

  let calendarMonth = currentMonth();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const updateCtx = await conversation.wait();

    if (updateCtx.message?.text) {
      const text = updateCtx.message.text;
      if (isCancelInput(text)) {
        try {
          await ctx.api.deleteMessage(promptMsg.chat.id, promptMsg.message_id);
        } catch {
          // The message may already be gone.
        }
        await ctx.reply(options?.cancelMessage ?? "已取消。");
        return null;
      }
      const trimmed = text.trim().toLowerCase();
      if (
        options?.confirmValue &&
        options.confirmTexts?.some((value) => value.toLowerCase() === trimmed)
      ) {
        try {
          await ctx.api.deleteMessage(promptMsg.chat.id, promptMsg.message_id);
        } catch {
          // The message may already be gone.
        }
        return options.confirmValue;
      }
      const result = validateDateInput(text);
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
      await ctx.reply(options?.cancelMessage ?? "已取消。");
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

    const dateResult = validateDateInput(parsedDate.date);
    if (dateResult.error) {
      await updateCtx.answerCallbackQuery("日期无效。");
      await ctx.reply(dateResult.error + "\n请重新开始当前操作。");
      return null;
    }

    await updateCtx.answerCallbackQuery();
    await safeDeleteMessage(updateCtx);
    return dateResult.date!;
  }
}
