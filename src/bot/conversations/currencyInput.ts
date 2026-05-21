import { Conversation } from "@grammyjs/conversations";
import { BotContext, BaseBotContext } from "../../types/context.js";
import { parseAddCurrencyCallbackData } from "../../utils/callbackParser.js";
import { isCancelInput } from "../../utils/conversationInput.js";
import {
  currencyKeyboard,
  validateCurrencyInput,
} from "../../utils/currency.js";

export interface CurrencyInputResult {
  currency?: string;
  cancelled: boolean;
}

async function safeDeleteMessage(ctx: BaseBotContext): Promise<void> {
  try {
    await ctx.deleteMessage();
  } catch {
    // The callback message may already be gone.
  }
}

export async function collectCurrencyInput(
  conversation: Conversation<BotContext, BaseBotContext>,
  ctx: BaseBotContext,
  {
    prompt = "请选择币种：",
    hasPrice,
    restartHint,
    cancelMessage = "已取消。",
  }: {
    prompt?: string;
    hasPrice: boolean;
    restartHint?: string;
    cancelMessage?: string;
  },
): Promise<CurrencyInputResult> {
  await ctx.reply(prompt, {
    reply_markup: currencyKeyboard(hasPrice),
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
      await ctx.reply(cancelMessage);
      return { cancelled: true };
    }

    if (parsedCurrency.action === "skip") {
      if (hasPrice) {
        await ctx.reply("已填写价格时必须选择币种。");
        continue;
      }
      await safeDeleteMessage(currencyCtx);
      return { currency: undefined, cancelled: false };
    }

    if (parsedCurrency.action === "other") {
      await safeDeleteMessage(currencyCtx);
      await ctx.reply("请输入 3 位币种代码，例如 CNY 或 USD。");
      const customCurrencyCtx = await conversation.waitFor("message:text");
      const customCurrencyText = customCurrencyCtx.msg.text;
      if (isCancelInput(customCurrencyText)) {
        await ctx.reply(cancelMessage);
        return { cancelled: true };
      }
      const result = validateCurrencyInput(customCurrencyText, hasPrice);
      if (result.error || !result.currency) {
        await ctx.reply(
          (result.error ?? "请输入有效的币种代码。") + (restartHint ?? ""),
        );
        return { cancelled: true };
      }
      return { currency: result.currency, cancelled: false };
    }

    await safeDeleteMessage(currencyCtx);
    return { currency: parsedCurrency.currency, cancelled: false };
  }
}
