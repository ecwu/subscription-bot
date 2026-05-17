import { BotContext } from "../../types/context.js";
import { createSubscriptionService } from "../../services/subscriptionService.js";
import { createSubscriptionRepository } from "../../repositories/subscriptionRepository.js";
import { createReminderRepository } from "../../repositories/reminderRepository.js";
import { formatSubscriptionLine } from "../../utils/formatSubscription.js";
import { subscriptionActionsKeyboard } from "../keyboards/subscriptionActionsKeyboard.js";
import { createLogger } from "../../utils/logger.js";

export async function listCommand(ctx: BotContext): Promise<void> {
  const logger = createLogger(ctx.requestId);

  if (!ctx.userKey) {
    await ctx.reply("无法识别用户，请稍后再试。");
    logger.warn("List command without userKey");
    return;
  }

  const repo = createSubscriptionRepository(ctx.env.SUBSCRIPTION_KV);
  const reminderRepo = createReminderRepository(ctx.env.SUBSCRIPTION_KV);
  const service = createSubscriptionService(repo, reminderRepo);

  const subs = await service.list(ctx.userKey, ctx.env.ENCRYPTION_KEY);

  if (subs.length === 0) {
    await ctx.reply("你还没有添加任何订阅。\n发送 /add 添加第一个订阅。");
    return;
  }

  // Sort by next billing date for a consistent view
  const sorted = subs.sort(
    (a, b) =>
      new Date(a.nextBillingDate).getTime() -
      new Date(b.nextBillingDate).getTime(),
  );

  await ctx.reply("你的订阅：");

  for (let i = 0; i < sorted.length; i++) {
    const sub = sorted[i];
    const line = formatSubscriptionLine(sub, i);
    await ctx.reply(line, {
      reply_markup: subscriptionActionsKeyboard(sub.id),
    });
  }

  logger.info("Listed subscriptions", {
    count: subs.length,
  });
}
