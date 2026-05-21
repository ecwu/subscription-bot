import { Conversation } from "@grammyjs/conversations";
import { BotContext, BaseBotContext } from "../../types/context.js";
import { createLogger } from "../../utils/logger.js";
import { InlineKeyboard } from "grammy";
import {
  UserSettings,
  SUPPORTED_TIMEZONES,
} from "../../models/userSettings.js";
import { createUserRepository } from "../../repositories/userRepository.js";
import {
  parseSettingsCallbackData,
} from "../../utils/callbackParser.js";
import {
  COMMON_CURRENCIES,
  validateCurrencyInput,
} from "../../utils/currency.js";
import { normalizeUtcOffset } from "../../models/userSettings.js";

export function settingsKeyboard(settings: UserSettings): InlineKeyboard {
  const reminderLabel = settings.reminderEnabled ? "ON" : "OFF";
  const hourLabel = String(settings.reminderHour).padStart(2, "0") + ":00";

  return new InlineKeyboard()
    .text(
      `Currency: ${settings.defaultCurrency}`,
      "settings:currency",
    )
    .row()
    .text(
      `Reminders: ${reminderLabel}`,
      "settings:toggle_reminder",
    )
    .row()
    .text(`Time: ${hourLabel}`, "settings:hour")
    .row()
    .text(`Timezone: ${settings.timezone}`, "settings:timezone")
    .row()
    .text("Done", "settings:done");
}

export function hourPickerKeyboard(currentHour?: number): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (let h = 0; h < 24; h++) {
    const label = String(h).padStart(2, "0");
    keyboard.text(
      currentHour === h ? `* ${label}` : label,
      `settings:hour:${h}`,
    );
    if ((h + 1) % 8 === 0) keyboard.row();
  }

  keyboard.text("返回", "settings:back");
  return keyboard;
}

export function timezoneKeyboard(currentTimezone?: string): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  SUPPORTED_TIMEZONES.forEach((tz, index) => {
    const label = tz.iana === currentTimezone ? `* ${tz.label}` : tz.label;
    keyboard.text(label, `settings:tz:${tz.iana}`);
    if (index % 2 === 1) keyboard.row();
  });

  keyboard.text("Custom offset", "settings:tz:custom");
  keyboard.row().text("返回", "settings:back");
  return keyboard;
}

function currencySelectionKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  COMMON_CURRENCIES.forEach((currency, index) => {
    keyboard.text(currency, `settings:currency:${currency}`);
    if (index % 4 === 3) keyboard.row();
  });

  keyboard.text("其他", "settings:currency:other");
  keyboard.row().text("返回", "settings:back");
  return keyboard;
}

function isCancel(text: string): boolean {
  return text.trim() === "/cancel" || text.trim() === "取消";
}

export async function settingsConversation(
  conversation: Conversation<BotContext, BaseBotContext>,
  ctx: BaseBotContext,
): Promise<void> {
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

  let settings = await conversation.external(async (outsideCtx) => {
    const repo = createUserRepository(outsideCtx.env.SUBSCRIPTION_KV);
    return repo.getUserSettings(userKey, encryptionKey);
  });

  logger.info("Settings conversation started");

  let menuMessage = await ctx.reply("⚙️ Settings", {
    reply_markup: settingsKeyboard(settings),
  });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const updateCtx = await conversation.wait();

    if (updateCtx.message?.text) {
      const text = updateCtx.message.text;
      if (isCancel(text)) {
        await ctx.reply("已取消。");
        return;
      }
      continue;
    }

    if (!updateCtx.callbackQuery?.data) continue;

    const callbackData = updateCtx.callbackQuery.data;
    const parsed = parseSettingsCallbackData(callbackData);

    if (parsed) {
      await updateCtx.answerCallbackQuery();

      if (parsed.action === "done") {
        try {
          await ctx.api.editMessageText(
            menuMessage.chat.id,
            menuMessage.message_id,
            "⚙️ Settings\n\nSettings updated.",
          );
        } catch {
          await ctx.reply("Settings updated.");
        }
        logger.info("Settings conversation completed");
        return;
      }

      if (parsed.action === "toggle_reminder") {
        settings = {
          ...settings,
          reminderEnabled: !settings.reminderEnabled,
        };
        await saveSettings(conversation, userKey, settings, encryptionKey);

        try {
          await updateCtx.editMessageReplyMarkup({
            reply_markup: settingsKeyboard(settings),
          });
        } catch {
          await ctx.reply("⚙️ Settings", {
            reply_markup: settingsKeyboard(settings),
          });
        }
        continue;
      }

      if (parsed.action === "hour") {
        await updateCtx.editMessageReplyMarkup({
          reply_markup: hourPickerKeyboard(settings.reminderHour),
        });
        continue;
      }

      if (parsed.action === "select_hour") {
        settings = {
          ...settings,
          reminderHour: parsed.hour,
        };
        await saveSettings(conversation, userKey, settings, encryptionKey);

        try {
          await updateCtx.editMessageReplyMarkup({
            reply_markup: settingsKeyboard(settings),
          });
        } catch {
          await ctx.reply("⚙️ Settings", {
            reply_markup: settingsKeyboard(settings),
          });
        }
        continue;
      }

      if (parsed.action === "timezone") {
        await updateCtx.editMessageReplyMarkup({
          reply_markup: timezoneKeyboard(settings.timezone),
        });
        continue;
      }

      if (parsed.action === "select_timezone") {
        settings = {
          ...settings,
          timezone: parsed.timezone,
        };
        await saveSettings(conversation, userKey, settings, encryptionKey);

        try {
          await updateCtx.editMessageReplyMarkup({
            reply_markup: settingsKeyboard(settings),
          });
        } catch {
          await ctx.reply("⚙️ Settings", {
            reply_markup: settingsKeyboard(settings),
          });
        }
        continue;
      }

      continue;
    }

    // Handle custom timezone offset trigger
    if (callbackData === "settings:tz:custom") {
      await updateCtx.answerCallbackQuery();

      try {
        await updateCtx.editMessageText(
          "Please enter your UTC offset, e.g. +8, -5, +5:30.",
        );
      } catch {
        await ctx.reply("Please enter your UTC offset, e.g. +8, -5, +5:30.");
      }

      const customTzCtx = await conversation.waitFor("message:text");
      const customTzText = customTzCtx.msg.text;
      if (isCancel(customTzText)) {
        await ctx.reply("已取消。");
        return;
      }

      const normalized = normalizeUtcOffset(customTzText);
      if (!normalized) {
        await ctx.reply(
          "Invalid offset. Use format like +8, -5, +5:30.\nPlease send /settings to try again.",
        );
        return;
      }

      settings = {
        ...settings,
        timezone: normalized,
      };
      await saveSettings(conversation, userKey, settings, encryptionKey);

      menuMessage = await ctx.reply("⚙️ Settings", {
        reply_markup: settingsKeyboard(settings),
      });
      continue;
    }

    // Handle "currency" action: show currency picker
    if (callbackData === "settings:currency") {
      await updateCtx.answerCallbackQuery();
      try {
        await updateCtx.editMessageReplyMarkup({
          reply_markup: currencySelectionKeyboard(),
        });
      } catch {
        await ctx.reply("⚙️ Settings", {
          reply_markup: currencySelectionKeyboard(),
        });
      }
      continue;
    }

    // Handle settings-specific currency callback
    if (callbackData.startsWith("settings:currency:")) {
      await updateCtx.answerCallbackQuery();

      if (callbackData === "settings:currency:back") {
        try {
          await updateCtx.editMessageReplyMarkup({
            reply_markup: settingsKeyboard(settings),
          });
        } catch {
          await ctx.reply("⚙️ Settings", {
            reply_markup: settingsKeyboard(settings),
          });
        }
        continue;
      }

      if (callbackData === "settings:currency:other") {
        try {
          await updateCtx.editMessageText(
            "请输入 3 位币种代码，例如 CNY 或 USD：",
          );
        } catch {
          await ctx.reply("请输入 3 位币种代码，例如 CNY 或 USD：");
        }

        const customCurrencyCtx = await conversation.waitFor("message:text");
        const customCurrencyText = customCurrencyCtx.msg.text;
        if (isCancel(customCurrencyText)) {
          await ctx.reply("已取消。");
          return;
        }

        const result = validateCurrencyInput(customCurrencyText, true);
        if (result.error) {
          await ctx.reply(result.error + "\n请发送 /settings 重新开始。");
          return;
        }
        if (!result.currency) {
          await ctx.reply("请输入有效的币种代码。\n请发送 /settings 重新开始。");
          return;
        }

        settings = {
          ...settings,
          defaultCurrency: result.currency,
        };
        await saveSettings(conversation, userKey, settings, encryptionKey);

        menuMessage = await ctx.reply("⚙️ Settings", {
          reply_markup: settingsKeyboard(settings),
        });
        continue;
      }

      // Parse custom settings currency selection
      const currencyValue = callbackData.slice("settings:currency:".length);
      if (/^[A-Z]{3}$/.test(currencyValue)) {
        settings = {
          ...settings,
          defaultCurrency: currencyValue,
        };
        await saveSettings(conversation, userKey, settings, encryptionKey);

        try {
          await updateCtx.editMessageReplyMarkup({
            reply_markup: settingsKeyboard(settings),
          });
        } catch {
          await ctx.reply("⚙️ Settings", {
            reply_markup: settingsKeyboard(settings),
          });
        }
        continue;
      }

      continue;
    }

    // Handle "back" from sub-menus
    if (callbackData === "settings:back") {
      await updateCtx.answerCallbackQuery();

      try {
        await updateCtx.editMessageReplyMarkup({
          reply_markup: settingsKeyboard(settings),
        });
      } catch {
        await ctx.reply("⚙️ Settings", {
          reply_markup: settingsKeyboard(settings),
        });
      }
      continue;
    }

    // Handle stale addcurrency callbacks from shared currency keyboard
    if (callbackData.startsWith("addcurrency:")) {
      await updateCtx.answerCallbackQuery(
        "This selection is no longer active. Use /settings to restart.",
      );
      continue;
    }

    await updateCtx.answerCallbackQuery();
  }
}

async function saveSettings(
  conversation: Conversation<BotContext, BaseBotContext>,
  userKey: string,
  settings: UserSettings,
  encryptionKey: string,
): Promise<void> {
  await conversation.external(async (outsideCtx) => {
    const repo = createUserRepository(outsideCtx.env.SUBSCRIPTION_KV);
    await repo.updateUserSettings(userKey, settings, encryptionKey);
  });
}
