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
    await ctx.reply("无法识别用户，请稍后再试。");
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
    await ctx.reply("你还没有添加任何订阅。\n发送 /add 添加第一个订阅。");
    return;
  }

  const exchangeRates = await configRepo.getExchangeRates();
  const report = buildReportData(subscriptions, exchangeRates);
  const fallbackText = formatReportText(report);

  try {
    const currentMonthlyPng = await renderReportPng(report.currentMonthly);
    const currentMonthDuePng = await renderReportPng(report.currentMonthDue);

    await ctx.replyWithPhoto(
      new InputFile(currentMonthlyPng, "current-monthly-report.png"),
      {
        caption: "当前月度支出",
      },
    );

    await ctx.replyWithPhoto(
      new InputFile(currentMonthDuePng, "current-month-due-report.png"),
      {
        caption: "当月支出",
      },
    );
    logger.info("Report generated", {
      subscriptionCount: report.subscriptionCount,
      currentMonthlyIncludedCount: report.currentMonthly.includedCount,
      currentMonthlyConvertedCount: report.currentMonthly.convertedCount,
      currentMonthlyMissingRateCount:
        report.currentMonthly.missingRateCurrencies.length,
      currentMonthDueIncludedCount: report.currentMonthDue.includedCount,
      currentMonthDueConvertedCount: report.currentMonthDue.convertedCount,
      currentMonthDueMissingRateCount:
        report.currentMonthDue.missingRateCurrencies.length,
    });
  } catch (error) {
    logger.warn("Report PNG failed; sent text fallback", {
      errorType: error instanceof Error ? error.name : typeof error,
      subscriptionCount: report.subscriptionCount,
      currentMonthlyIncludedCount: report.currentMonthly.includedCount,
      currentMonthlyConvertedCount: report.currentMonthly.convertedCount,
      currentMonthlyMissingRateCount:
        report.currentMonthly.missingRateCurrencies.length,
      currentMonthDueIncludedCount: report.currentMonthDue.includedCount,
      currentMonthDueConvertedCount: report.currentMonthDue.convertedCount,
      currentMonthDueMissingRateCount:
        report.currentMonthDue.missingRateCurrencies.length,
    });
    await ctx.reply(fallbackText);
  }
}
