import { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import { BillingCycle, BillingInterval } from "../../models/subscription.js";
import { parseBillingCycleText } from "../../utils/billingCycle.js";
import { isCancelInput } from "../../utils/conversationInput.js";
import { ValidationError } from "../../utils/errors.js";
import { BotContext, BaseBotContext } from "../../types/context.js";

export interface CycleSelection {
  cycle: BillingCycle;
  billingInterval?: BillingInterval;
}

const VALID_CYCLES: readonly BillingCycle[] = [
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
  "custom",
  "interval",
];

export function cycleKeyboard(
  callbackData: (cycle: BillingCycle) => string,
): InlineKeyboard {
  return new InlineKeyboard()
    .text("每周", callbackData("weekly"))
    .text("每月", callbackData("monthly"))
    .row()
    .text("每季度", callbackData("quarterly"))
    .text("每年", callbackData("yearly"))
    .row()
    .text("自定义", callbackData("custom"))
    .text("高级间隔", callbackData("interval"));
}

export async function collectCycleInput(
  conversation: Conversation<BotContext, BaseBotContext>,
  ctx: BaseBotContext,
  {
    prompt = "请选择扣款周期：",
    callbackPattern,
    callbackData,
    parseCycle,
    invalidSelectionMessage,
    restartHint,
  }: {
    prompt?: string;
    callbackPattern: RegExp;
    callbackData: (cycle: BillingCycle) => string;
    parseCycle: (callbackData: string) => string | null;
    invalidSelectionMessage: string;
    restartHint: string;
  },
): Promise<CycleSelection | null> {
  await ctx.reply(prompt, {
    reply_markup: cycleKeyboard(callbackData),
  });
  const cycleCtx = await conversation.waitForCallbackQuery(callbackPattern);
  const selectedCycle = parseCycle(cycleCtx.callbackQuery.data) as BillingCycle;
  if (!VALID_CYCLES.includes(selectedCycle)) {
    await ctx.reply(invalidSelectionMessage);
    return null;
  }
  await cycleCtx.answerCallbackQuery();
  try {
    await cycleCtx.deleteMessage();
  } catch {
    // The callback message may already be gone.
  }

  if (selectedCycle !== "interval") {
    return { cycle: selectedCycle };
  }

  await ctx.reply(
    "请输入间隔，例如 every 30 days、every 4 weeks、6m、2y、30d、4w、每30天、每4周、每6个月、每2年。",
  );
  const intervalCtx = await conversation.waitFor("message:text");
  const intervalText = intervalCtx.msg.text;
  if (isCancelInput(intervalText)) {
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
      await ctx.reply(err.message + restartHint);
      return null;
    }
    throw err;
  }
}
