import { InputFile } from "grammy";
import type { BotContext } from "../../types/context.js";
import { createSubscriptionService } from "../../services/subscriptionService.js";
import {
  buildReportData,
  formatReportText,
} from "../../services/reportService.js";
import { createSubscriptionRepository } from "../../repositories/subscriptionRepository.js";
import { createReminderRepository } from "../../repositories/reminderRepository.js";
import { createReportConfigRepository } from "../../repositories/reportConfigRepository.js";
import { renderReportPng } from "../../utils/reportPng.js";
import { createLogger } from "../../utils/logger.js";

export async function reportCommand(ctx: BotContext): Promise<void> {
  const logger = createLogger(ctx.requestId);

  if (!ctx.userKey) {
    await ctx.reply("Unable to identify user. Please try again.");
    logger.warn("Report command without userKey");
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
    await ctx.reply(
      "You have no subscriptions yet.\nUse /add to create your first one.",
    );
    return;
  }

  const exchangeRates = await configRepo.getExchangeRates();
  const report = buildReportData(subscriptions, exchangeRates);
  const fallbackText = formatReportText(report);

  try {
    const png = await renderReportPng(report);
    await ctx.replyWithPhoto(new InputFile(png, "subscription-report.png"), {
      caption: "Subscription run-rate report",
    });
    logger.info("Report generated", {
      subscriptionCount: report.subscriptionCount,
      includedCount: report.includedCount,
      convertedCount: report.convertedCount,
      missingRateCount: report.missingRateCurrencies.length,
    });
  } catch (error) {
    logger.warn("Report PNG failed; sent text fallback", {
      errorType: error instanceof Error ? error.name : typeof error,
      subscriptionCount: report.subscriptionCount,
      includedCount: report.includedCount,
      convertedCount: report.convertedCount,
      missingRateCount: report.missingRateCurrencies.length,
    });
    await ctx.reply(fallbackText);
  }
}
