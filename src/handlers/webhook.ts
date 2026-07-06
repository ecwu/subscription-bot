import { webhookCallback } from "grammy";
import { createBot } from "../bot/createBot.js";
import { Env } from "../types/env.js";

const encoder = new TextEncoder();

async function timingSafeEqualSecret(
  provided: string,
  expected: string,
): Promise<boolean> {
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);

  if (typeof crypto.subtle.timingSafeEqual === "function") {
    return crypto.subtle.timingSafeEqual(providedHash, expectedHash);
  }

  const providedBytes = new Uint8Array(providedHash);
  const expectedBytes = new Uint8Array(expectedHash);
  let diff = 0;
  for (let i = 0; i < providedBytes.length; i += 1) {
    diff |= providedBytes[i]! ^ expectedBytes[i]!;
  }
  return diff === 0;
}

export async function handleWebhook(
  request: Request,
  env: Env,
): Promise<Response> {
  const secretToken = request.headers.get("X-Telegram-Bot-Api-Secret-Token");

  if (
    !secretToken ||
    !(await timingSafeEqualSecret(secretToken, env.TELEGRAM_WEBHOOK_SECRET))
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const bot = createBot(env);
  const callback = webhookCallback(bot, "cloudflare-mod");

  return callback(request);
}
