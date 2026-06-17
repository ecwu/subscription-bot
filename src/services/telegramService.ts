import { Env } from "../types/env.js";

export interface TelegramSendResult {
  ok: boolean;
  status?: number;
  description?: string;
}

export interface TelegramInlineKeyboardMarkup {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
}

export interface TelegramSendOptions {
  reply_markup?: TelegramInlineKeyboardMarkup;
}

/**
 * Send a plain text message via the Telegram Bot API.
 * Does not log the token, chatId, or message text.
 */
export async function sendMessage(
  env: Env,
  chatId: number | string,
  text: string,
  options: TelegramSendOptions = {},
): Promise<TelegramSendResult> {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...options,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    let description: string | undefined;
    try {
      const parsed = JSON.parse(body);
      description = parsed.description;
    } catch {
      // ignore parse error
    }
    return {
      ok: false,
      status: response.status,
      description,
    };
  }

  return { ok: true };
}
