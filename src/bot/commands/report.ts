import { InputFile } from "grammy";
import type { BotContext } from "../../types/context.js";
import { createSubscriptionService } from "../../services/subscriptionService.js";
import {
  buildReportData,
  formatReportText,
} from "../../services/reportService.js";
import { createSubscriptionRepository } from "../../repositories/subscriptionRepository.js";
import { createReminderRepository } from "../../repositories/reminderRepository.js";
import { createUserRepository } from "../../repositories/userRepository.js";
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

  const userRepo = createUserRepository(ctx.env.SUBSCRIPTION_KV);
  const settings = await userRepo.getUserSettings(
    ctx.userKey,
    ctx.env.ENCRYPTION_KEY,
  );
  const timezone = settings.timezone || "UTC";

  const report = buildReportData(
    subscriptions,
    exchangeRates,
    timezone,
    settings.defaultCurrency,
  );
  const fallbackText = formatReportText(report);

  try {
    const currentMonthlyPng = await renderReportPng(report.currentMonthly);
    const upcomingDuePng = await renderReportPng(report.currentMonthDue);
    const yearlyProjectionPng = await renderReportPng(report.yearlyProjection);

    await ctx.replyWithPhoto(
      new InputFile(currentMonthlyPng, "upcoming-30-days-monthly-report.png"),
      {
        caption: "未来30天摊平支出",
      },
    );

    await ctx.replyWithPhoto(
      new InputFile(upcomingDuePng, "upcoming-30-days-report.png"),
      {
        caption: "未来30天支出",
      },
    );

    await ctx.replyWithPhoto(
      new InputFile(yearlyProjectionPng, "yearly-projection-report.png"),
      {
        caption: "年度预期支出",
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
      yearlyProjectionIncludedCount: report.yearlyProjection.includedCount,
      yearlyProjectionConvertedCount: report.yearlyProjection.convertedCount,
      yearlyProjectionMissingRateCount:
        report.yearlyProjection.missingRateCurrencies.length,
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
      yearlyProjectionIncludedCount: report.yearlyProjection.includedCount,
      yearlyProjectionConvertedCount: report.yearlyProjection.convertedCount,
      yearlyProjectionMissingRateCount:
        report.yearlyProjection.missingRateCurrencies.length,
    });
    await ctx.reply(fallbackText);
  }
}
