import { Bot, webhookCallback } from "grammy";
import { createBot } from "../bot/createBot.js";
import { Env } from "../types/env.js";
import { BotContext } from "../types/context.js";

// Cache bot instance per isolate so session/conversation state persists
// across webhook requests within the same Cloudflare Worker isolate.
// Isolates are recycled unpredictably, so conversations may still reset
// when an isolate is evicted — that is expected MVP behaviour.
let bot: Bot<BotContext> | null = null;

export async function handleWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  const secretToken = request.headers.get("X-Telegram-Bot-Api-Secret-Token");

  if (!secretToken || secretToken !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!bot) {
    bot = createBot(env);
  }

  const callback = webhookCallback(bot, "cloudflare-mod");

  return callback(request);
}
