import {
  ReminderRepository,
  ReminderEntry,
} from "../repositories/reminderRepository.js";
import { SubscriptionRepository } from "../repositories/subscriptionRepository.js";
import { UserRepository } from "../repositories/userRepository.js";
import { Subscription } from "../models/subscription.js";
import { DecryptedUserProfile } from "../models/user.js";
import { UserSettings } from "../models/userSettings.js";
import { DEFAULT_USER_SETTINGS } from "../models/userSettings.js";
import { SubscriptionService } from "./subscriptionService.js";
import { Env } from "../types/env.js";
import { sendMessage } from "./telegramService.js";
import { decrypt, parseEncryptedPayload } from "../crypto/encryption.js";
import { log } from "../utils/logger.js";
import { addDays, formatDate, getLocalTimeInfo } from "../utils/date.js";
import {
  isAutoRenewing,
  isTrialSubscription,
} from "../utils/subscriptionFlags.js";

function getReminderDaysAhead(env: Env): number {
  const raw = env.REMINDER_DAYS_AHEAD;
  if (raw === undefined || raw === null) return 3;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 3;
  return Math.floor(parsed);
}

function isReminderDispatchSlot(
  localHour: number,
  localMinute: number,
  reminderHour: number,
): boolean {
  return localHour === reminderHour && localMinute < 30;
}

function formatReminderMessage(sub: Subscription): string {
  const lines: string[] = [];

  if (isTrialSubscription(sub)) {
    lines.push(
      `体验到期提醒：\n${sub.name} 将在 ${sub.nextBillingDate} 到期，之后可能开始扣款。`,
    );
  } else if (!isAutoRenewing(sub)) {
    lines.push(
      `服务到期提醒：\n${sub.name} 将在 ${sub.nextBillingDate} 到期，已关闭自动续费。`,
    );
  } else {
    lines.push(`扣款提醒：\n${sub.name} 将在 ${sub.nextBillingDate} 扣款。`);
  }

  if (sub.price !== undefined) {
    lines.push(`价格：${sub.price} ${sub.currency ?? ""}`.trim());
  }

  lines.push(`\n发送 /view ${sub.id.slice(0, 8)} 查看详情。`);
  return lines.join("\n");
}

function getReminderKindLabel(sub: Subscription): string {
  if (isTrialSubscription(sub)) return "体验到期";
  if (!isAutoRenewing(sub)) return "服务到期";
  return "扣款";
}

function formatReminderListItem(sub: Subscription, index: number): string {
  const parts = [
    `${index}. ${getReminderKindLabel(sub)}：${sub.name}`,
    `日期：${sub.nextBillingDate}`,
  ];

  if (sub.price !== undefined) {
    parts.push(`价格：${sub.price} ${sub.currency ?? ""}`.trim());
  }

  parts.push(`/view ${sub.id.slice(0, 8)}`);
  return parts.join("｜");
}

function formatCombinedReminderMessage(subs: Subscription[]): string {
  if (subs.length === 1) {
    return formatReminderMessage(subs[0]);
  }

  const sorted = [...subs].sort((a, b) => {
    const byDate = a.nextBillingDate.localeCompare(b.nextBillingDate);
    if (byDate !== 0) return byDate;
    return a.name.localeCompare(b.name);
  });

  return [
    `订阅提醒：以下 ${sorted.length} 个项目需要关注。`,
    "",
    ...sorted.map((sub, index) => formatReminderListItem(sub, index + 1)),
  ].join("\n");
}

export interface ReminderEntryResult {
  sent: boolean;
  advanced: boolean;
}

export interface ReminderEntryInput {
  entry: ReminderEntry;
  date: string;
}

export interface ReminderBatchResult {
  sent: number;
  messages: number;
  advanced: number;
}

interface PendingReminder {
  entry: ReminderEntry;
  date: string;
  sub: Subscription;
  userProfile: DecryptedUserProfile;
  settings: UserSettings;
  localHour: number;
  localMinute: number;
}

export async function processReminderEntry(
  env: Env,
  _reminderRepo: ReminderRepository,
  subRepo: SubscriptionRepository,
  userRepo: UserRepository,
  subscriptionService: SubscriptionService,
  entry: ReminderEntry,
  date: string,
  daysAhead = getReminderDaysAhead(env),
): Promise<ReminderEntryResult> {
  const result: ReminderEntryResult = { sent: false, advanced: false };

  try {
    // 1. Load subscription and verify it still exists
    const stored = await subRepo.get(entry.userKey, entry.subscriptionId);
    if (!stored) {
      log("info", "Skipping stale reminder: subscription missing", {
        date,
        subId: entry.subscriptionId,
      });
      return result;
    }
    if (stored.nextBillingDate !== date) {
      log("info", "Skipping stale reminder: billing date mismatch", {
        date,
        subId: entry.subscriptionId,
      });
      return result;
    }

    // 2. Decrypt subscription
    const encryptedSub = parseEncryptedPayload(stored.encryptedPayload);
    const decryptedSub = await decrypt(encryptedSub, env.ENCRYPTION_KEY);
    const sub: Subscription = JSON.parse(decryptedSub);
    const status = sub.status ?? "active";

    // 2b. Skip paused subscriptions
    if (status === "paused") {
      log("info", "Skipping reminder: subscription paused", {
        date,
        subId: entry.subscriptionId,
      });
      return result;
    }

    // 3. Load user profile (includes chatId and settings)
    const userProfile = await userRepo.getUserProfile(
      entry.userKey,
      env.ENCRYPTION_KEY,
    );
    if (!userProfile) {
      log("warn", "Skipping reminder: no user profile", {
        date,
        subId: entry.subscriptionId,
      });
      return result;
    }

    const settings = userProfile.settings ?? DEFAULT_USER_SETTINGS;
    if (!settings.reminderEnabled) {
      return result;
    }

    // 4. Compute user's local time
    const tz = settings.timezone || "UTC";
    const local = getLocalTimeInfo(tz);
    if (!local) {
      log("warn", "Invalid timezone in user settings", {
        date,
        subId: entry.subscriptionId,
        timezone: tz,
      });
      return result;
    }

    const { date: localToday, hour: localHour, minute: localMinute } = local;
    const billingDate = sub.nextBillingDate;
    const reminderHour = settings.reminderHour ?? 9;
    const reminderStart = addDays(billingDate, -daysAhead);

    // 5. Reminder window has not started for this user
    if (localToday < reminderStart) {
      return result;
    }

    // 6. Billing date is past — catch-up advancement
    if (localToday > billingDate) {
      if (isTrialSubscription(sub) || !isAutoRenewing(sub)) {
        return result;
      }
      const advanced = await subscriptionService.advancePastDue(
        entry.userKey,
        entry.subscriptionId,
        env.ENCRYPTION_KEY,
        localToday,
      );
      if (advanced && advanced.nextBillingDate > localToday) {
        result.advanced = true;
      }
      return result;
    }

    // 7. Billing date is within the reminder window — send only in today's dispatch slot
    if (!isReminderDispatchSlot(localHour, localMinute, reminderHour)) {
      return result;
    }

    // 8. Send in this user's single daily dispatch slot.
    const message = formatReminderMessage(sub);
    const sendResult = await sendMessage(env, userProfile.chatId, message);

    if (!sendResult.ok) {
      log("warn", "Failed to send reminder", {
        date,
        subId: entry.subscriptionId,
        status: sendResult.status,
        description: sendResult.description,
      });
      // Continue to advancement below even if send failed
    } else {
      result.sent = true;
      log("info", "Reminder sent successfully", {
        date,
        subId: entry.subscriptionId,
        timezone: tz,
        localHour,
        localMinute,
      });
    }

    // 9. Advance due subscriptions after the billing-day dispatch slot (auto-renew only)
    if (localToday < billingDate) {
      return result;
    }

    if (isTrialSubscription(sub) || !isAutoRenewing(sub)) {
      return result;
    }

    const advanced = await subscriptionService.advancePastDue(
      entry.userKey,
      entry.subscriptionId,
      env.ENCRYPTION_KEY,
      localToday,
    );
    if (advanced && advanced.nextBillingDate > localToday) {
      result.advanced = true;
    }
  } catch (error) {
    log("error", "Error processing reminder entry", {
      date,
      subId: entry.subscriptionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return result;
}

async function collectPendingReminder(
  env: Env,
  subRepo: SubscriptionRepository,
  userRepo: UserRepository,
  subscriptionService: SubscriptionService,
  entry: ReminderEntry,
  date: string,
  daysAhead: number,
): Promise<{ pending?: PendingReminder; advanced: boolean }> {
  const result = {
    pending: undefined as PendingReminder | undefined,
    advanced: false,
  };

  try {
    const stored = await subRepo.get(entry.userKey, entry.subscriptionId);
    if (!stored) {
      log("info", "Skipping stale reminder: subscription missing", {
        date,
        subId: entry.subscriptionId,
      });
      return result;
    }
    if (stored.nextBillingDate !== date) {
      log("info", "Skipping stale reminder: billing date mismatch", {
        date,
        subId: entry.subscriptionId,
      });
      return result;
    }

    const encryptedSub = parseEncryptedPayload(stored.encryptedPayload);
    const decryptedSub = await decrypt(encryptedSub, env.ENCRYPTION_KEY);
    const sub: Subscription = JSON.parse(decryptedSub);
    const status = sub.status ?? "active";

    if (status === "paused") {
      log("info", "Skipping reminder: subscription paused", {
        date,
        subId: entry.subscriptionId,
      });
      return result;
    }

    const userProfile = await userRepo.getUserProfile(
      entry.userKey,
      env.ENCRYPTION_KEY,
    );
    if (!userProfile) {
      log("warn", "Skipping reminder: no user profile", {
        date,
        subId: entry.subscriptionId,
      });
      return result;
    }

    const settings = userProfile.settings ?? DEFAULT_USER_SETTINGS;
    if (!settings.reminderEnabled) {
      return result;
    }

    const tz = settings.timezone || "UTC";
    const local = getLocalTimeInfo(tz);
    if (!local) {
      log("warn", "Invalid timezone in user settings", {
        date,
        subId: entry.subscriptionId,
        timezone: tz,
      });
      return result;
    }

    const { date: localToday, hour: localHour, minute: localMinute } = local;
    const billingDate = sub.nextBillingDate;
    const reminderHour = settings.reminderHour ?? 9;
    const reminderStart = addDays(billingDate, -daysAhead);

    if (localToday < reminderStart) {
      return result;
    }

    if (localToday > billingDate) {
      if (isTrialSubscription(sub) || !isAutoRenewing(sub)) {
        return result;
      }
      const advanced = await subscriptionService.advancePastDue(
        entry.userKey,
        entry.subscriptionId,
        env.ENCRYPTION_KEY,
        localToday,
      );
      result.advanced = Boolean(
        advanced && advanced.nextBillingDate > localToday,
      );
      return result;
    }

    if (!isReminderDispatchSlot(localHour, localMinute, reminderHour)) {
      return result;
    }

    result.pending = {
      entry,
      date,
      sub,
      userProfile,
      settings,
      localHour,
      localMinute,
    };
  } catch (error) {
    log("error", "Error processing reminder entry", {
      date,
      subId: entry.subscriptionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return result;
}

export async function processReminderEntries(
  env: Env,
  _reminderRepo: ReminderRepository,
  subRepo: SubscriptionRepository,
  userRepo: UserRepository,
  subscriptionService: SubscriptionService,
  inputs: ReminderEntryInput[],
  daysAhead = getReminderDaysAhead(env),
): Promise<ReminderBatchResult> {
  const result: ReminderBatchResult = { sent: 0, messages: 0, advanced: 0 };
  const pendingByUser = new Map<string, PendingReminder[]>();

  for (const { entry, date } of inputs) {
    const { pending, advanced } = await collectPendingReminder(
      env,
      subRepo,
      userRepo,
      subscriptionService,
      entry,
      date,
      daysAhead,
    );

    if (advanced) result.advanced++;
    if (!pending) continue;

    const existing = pendingByUser.get(entry.userKey);
    if (existing) {
      existing.push(pending);
    } else {
      pendingByUser.set(entry.userKey, [pending]);
    }
  }

  for (const reminders of pendingByUser.values()) {
    const first = reminders[0];
    const sendResult = await sendMessage(
      env,
      first.userProfile.chatId,
      formatCombinedReminderMessage(reminders.map((item) => item.sub)),
    );

    if (!sendResult.ok) {
      for (const reminder of reminders) {
        log("warn", "Failed to send reminder", {
          date: reminder.date,
          subId: reminder.entry.subscriptionId,
          status: sendResult.status,
          description: sendResult.description,
        });
      }
    } else {
      result.sent += reminders.length;
      result.messages++;
      for (const reminder of reminders) {
        log("info", "Reminder sent successfully", {
          date: reminder.date,
          subId: reminder.entry.subscriptionId,
          timezone: reminder.settings.timezone || "UTC",
          localHour: reminder.localHour,
          localMinute: reminder.localMinute,
        });
      }
    }

    for (const reminder of reminders) {
      const localToday = getLocalTimeInfo(
        reminder.settings.timezone || "UTC",
      )?.date;
      if (!localToday || localToday < reminder.sub.nextBillingDate) {
        continue;
      }
      if (isTrialSubscription(reminder.sub) || !isAutoRenewing(reminder.sub)) {
        continue;
      }

      const advanced = await subscriptionService.advancePastDue(
        reminder.entry.userKey,
        reminder.entry.subscriptionId,
        env.ENCRYPTION_KEY,
        localToday,
      );
      if (advanced && advanced.nextBillingDate > localToday) {
        result.advanced++;
      }
    }
  }

  return result;
}

/**
 * Compute the date range for scheduled reminders.
 * Returns dates from today - 1 through today + daysAhead + 1 (inclusive).
 * The extra ±1 day covers timezone boundaries (UTC-12 to UTC+14).
 */
export function getReminderDateRange(daysAhead: number): string[] {
  const today = new Date();
  const dates: string[] = [];
  for (let i = -1; i <= daysAhead + 1; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() + i);
    dates.push(formatDate(d));
  }
  return dates;
}

export { getReminderDaysAhead };
