import { BotContext } from "../../types/context.js";
import { createSubscriptionService } from "../../services/subscriptionService.js";
import { createSubscriptionRepository } from "../../repositories/subscriptionRepository.js";
import { createReminderRepository } from "../../repositories/reminderRepository.js";
import {
  formatSubscriptionFullLine,
  formatSubscriptionLine,
} from "../../utils/formatSubscription.js";
import { subscriptionActionsKeyboard } from "../keyboards/subscriptionActionsKeyboard.js";
import { createLogger } from "../../utils/logger.js";
import type { Subscription } from "../../models/subscription.js";
import { formatDate } from "../../utils/date.js";

const MAX_LIST_MESSAGE_LENGTH = 3900;

async function listSubscriptions(
  ctx: BotContext,
): Promise<Subscription[] | null> {
  if (!ctx.userKey) {
    await ctx.reply("无法识别用户，请稍后再试。");
    return null;
  }

  const repo = createSubscriptionRepository(ctx.env.SUBSCRIPTION_KV);
  const reminderRepo = createReminderRepository(ctx.env.SUBSCRIPTION_KV);
  const service = createSubscriptionService(repo, reminderRepo);

  const subs = await service.list(ctx.userKey, ctx.env.ENCRYPTION_KEY);
  return subs.sort((a, b) => {
    const statusA = a.status === "paused" ? 1 : 0;
    const statusB = b.status === "paused" ? 1 : 0;
    if (statusA !== statusB) return statusA - statusB;
    return (
      new Date(a.nextBillingDate).getTime() -
      new Date(b.nextBillingDate).getTime()
    );
  });
}

function buildListMessages(header: string, lines: string[]): string[] {
  const messages: string[] = [];
  let current = `${header}\n\n`;

  for (const line of lines) {
    const next = current.endsWith("\n\n")
      ? current + line
      : current + "\n" + line;
    if (next.length > MAX_LIST_MESSAGE_LENGTH && !current.endsWith("\n\n")) {
      messages.push(current);
      current = `${header}（续）：\n\n${line}`;
    } else {
      current = next;
    }
  }

  messages.push(current);
  return messages;
}

export async function listCommand(ctx: BotContext): Promise<void> {
  const logger = createLogger(ctx.requestId);

  const subs = await listSubscriptions(ctx);
  if (!subs) {
    logger.warn("List command without userKey");
    return;
  }

  if (subs.length === 0) {
    await ctx.reply("你还没有添加任何订阅。\n发送 /add 添加第一个订阅。");
    return;
  }

  const today = formatDate(new Date());
  const lines = subs.map((sub, index) =>
    formatSubscriptionLine(sub, index, today),
  );

  for (const message of buildListMessages("你的订阅：", lines)) {
    await ctx.reply(message);
  }

  logger.info("Listed compact subscriptions", {
    count: subs.length,
  });
}

export async function listFullCommand(ctx: BotContext): Promise<void> {
  const logger = createLogger(ctx.requestId);

  const subs = await listSubscriptions(ctx);
  if (!subs) {
    logger.warn("List full command without userKey");
    return;
  }

  if (subs.length === 0) {
    await ctx.reply("你还没有添加任何订阅。\n发送 /add 添加第一个订阅。");
    return;
  }

  await ctx.reply("你的订阅（完整）：");

  for (let i = 0; i < subs.length; i++) {
    const sub = subs[i];
    const line = formatSubscriptionFullLine(sub, i);
    await ctx.reply(line, {
      reply_markup: subscriptionActionsKeyboard(sub.id, sub.status),
    });
  }

  logger.info("Listed full subscriptions", {
    count: subs.length,
  });
}
