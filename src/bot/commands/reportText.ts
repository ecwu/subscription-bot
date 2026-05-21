import type { BotContext } from "../../types/context.js";
import { createSubscriptionService } from "../../services/subscriptionService.js";
import {
  buildTextReportData,
  formatTextReport,
} from "../../services/reportService.js";
import { createSubscriptionRepository } from "../../repositories/subscriptionRepository.js";
import { createReminderRepository } from "../../repositories/reminderRepository.js";
import { createUserRepository } from "../../repositories/userRepository.js";
import { createReportConfigRepository } from "../../repositories/reportConfigRepository.js";
import { createLogger } from "../../utils/logger.js";

export async function reportTextCommand(ctx: BotContext): Promise<void> {
  const logger = createLogger(ctx.requestId);

  if (!ctx.userKey) {
    await ctx.reply("无法识别用户，请稍后再试。");
    logger.warn("Report text command without userKey");
    return;
  }

  const repo = createSubscriptionRepository(ctx.env.SUBSCRIPTION_KV);
  const reminderRepo = createReminderRepository(ctx.env.SUBSCRIPTION_KV);
  const configRepo = createReportConfigRepository(ctx.env.SUBSCRIPTION_KV);
  const subscriptionService = createSubscriptionService(repo, reminderRepo);

  const subscriptions = await subscriptionService.list(
    ctx.userKey,
    ctx.env.ENCRYPTION_KEY,
  );
  if (subscriptions.length === 0) {
    await ctx.reply("你还没有添加任何订阅。\n发送 /add 添加第一个订阅。");
    return;
  }

  const exchangeRates = await configRepo.getExchangeRates();

  const userRepo = createUserRepository(ctx.env.SUBSCRIPTION_KV);
  const settings = await userRepo.getUserSettings(
    ctx.userKey,
    ctx.env.ENCRYPTION_KEY,
  );
  const timezone = settings.timezone || "UTC";

  const data = buildTextReportData(subscriptions, exchangeRates, timezone);
  const chunks = formatTextReport(data);

  for (const chunk of chunks) {
    await ctx.reply(chunk);
  }

  logger.info("Text report generated", {
    subscriptionCount: subscriptions.length,
    currentMonthItemCount: data.currentMonthItems.length,
    yearMonthItemCount: data.yearMonthItems.filter((m) => m.items.length > 0)
      .length,
  });
}
