import { Env } from "../types/env.js";
import { createReminderRepository } from "../repositories/reminderRepository.js";
import { createSubscriptionRepository } from "../repositories/subscriptionRepository.js";
import { createUserRepository } from "../repositories/userRepository.js";
import {
  createReminderService,
  getReminderDaysAhead,
  getReminderDateRange,
} from "../services/reminderService.js";
import { createSubscriptionService } from "../services/subscriptionService.js";
import { log } from "../utils/logger.js";

export async function handleScheduled(
  _controller: ScheduledController,
  env: Env,
): Promise<void> {
  const daysAhead = getReminderDaysAhead(env);
  const dates = getReminderDateRange(daysAhead);

  log("info", "Scheduled trigger fired", {
    env: env.APP_ENV,
    daysAhead,
    dateCount: dates.length,
  });

  const reminderRepo = createReminderRepository(env.SUBSCRIPTION_KV);
  const subRepo = createSubscriptionRepository(env.SUBSCRIPTION_KV);
  const userRepo = createUserRepository(env.SUBSCRIPTION_KV);
  const subscriptionService = createSubscriptionService(subRepo, reminderRepo);
  const reminderService = createReminderService(
    env,
    reminderRepo,
    subRepo,
    userRepo,
  );

  for (const date of dates) {
    await reminderService.processDay(date);
  }

  const today = dates[0];
  const dueDates = await reminderRepo.listDatesThrough(today);
  let advancedCount = 0;

  for (const date of dueDates) {
    const entries = await reminderRepo.listEntries(date);
    for (const entry of entries) {
      const advanced = await subscriptionService.advancePastDue(
        entry.userKey,
        entry.subscriptionId,
        env.ENCRYPTION_KEY,
        today,
      );
      if (advanced && advanced.nextBillingDate > today) {
        advancedCount++;
      }
    }
  }

  log("info", "Scheduled reminder processing complete", {
    env: env.APP_ENV,
    daysAhead,
    dateCount: dates.length,
    advancedCount,
  });
}
