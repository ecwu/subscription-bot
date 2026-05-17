import { BotContext } from "../../types/context.js";
import { createSubscriptionService } from "../../services/subscriptionService.js";
import { createSubscriptionRepository } from "../../repositories/subscriptionRepository.js";
import { createReminderRepository } from "../../repositories/reminderRepository.js";
import { createLogger } from "../../utils/logger.js";
import { addDays, formatDate } from "../../utils/date.js";
import { Env } from "../../types/env.js";

function getReminderDaysAhead(env: Env): number {
  const raw = env.REMINDER_DAYS_AHEAD;
  if (raw === undefined || raw === null) return 3;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 3;
  return Math.floor(parsed);
}

export async function remindersCommand(ctx: BotContext): Promise<void> {
  const logger = createLogger(ctx.requestId);

  if (!ctx.userKey) {
    await ctx.reply("Unable to identify user. Please try again.");
    logger.warn("Reminders command without userKey");
    return;
  }

  const daysAhead = getReminderDaysAhead(ctx.env);
  const today = formatDate(new Date());
  const maxDate = addDays(today, daysAhead);

  const subRepo = createSubscriptionRepository(ctx.env.SUBSCRIPTION_KV);
  const reminderRepo = createReminderRepository(ctx.env.SUBSCRIPTION_KV);
  const service = createSubscriptionService(subRepo, reminderRepo);

  const subs = await service.list(ctx.userKey, ctx.env.ENCRYPTION_KEY);

  const upcoming = subs
    .filter(
      (sub) => sub.nextBillingDate >= today && sub.nextBillingDate <= maxDate,
    )
    .sort((a, b) => a.nextBillingDate.localeCompare(b.nextBillingDate));

  if (upcoming.length === 0) {
    await ctx.reply("No upcoming renewals.");
    logger.info("Reminders command: no upcoming renewals");
    return;
  }

  const lines = upcoming.map((sub) => {
    const priceStr =
      sub.price !== undefined && sub.currency
        ? `${sub.price} ${sub.currency}`
        : sub.price !== undefined
          ? `${sub.price}`
          : "";
    const parts = [sub.name, priceStr, `renews ${sub.nextBillingDate}`].filter(
      Boolean,
    );
    return parts.join(" — ");
  });

  await ctx.reply("Upcoming renewals:\n\n" + lines.join("\n"));

  logger.info("Reminders command: listed upcoming renewals", {
    count: upcoming.length,
  });
}
