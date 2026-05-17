import { ReminderRepository } from "../repositories/reminderRepository.js";
import { SubscriptionRepository } from "../repositories/subscriptionRepository.js";
import { UserRepository } from "../repositories/userRepository.js";
import { Subscription } from "../models/subscription.js";
import { Env } from "../types/env.js";
import { sendMessage } from "./telegramService.js";
import { decrypt, parseEncryptedPayload } from "../crypto/encryption.js";
import { log } from "../utils/logger.js";
import { formatDate } from "../utils/date.js";

export interface ReminderService {
  processDay(date: string): Promise<void>;
}

function getReminderDaysAhead(env: Env): number {
  const raw = env.REMINDER_DAYS_AHEAD;
  if (raw === undefined || raw === null) return 3;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 3;
  return Math.floor(parsed);
}

function formatReminderMessage(sub: Subscription): string {
  const lines: string[] = [
    `Renewal reminder:\n${sub.name} renews on ${sub.nextBillingDate}.`,
  ];

  if (sub.price !== undefined) {
    lines.push(`Price: ${sub.price} ${sub.currency ?? ""}`.trim());
  }

  lines.push(`\nUse /view ${sub.id.slice(0, 8)} for details.`);
  return lines.join("\n");
}

export function createReminderService(
  env: Env,
  reminderRepo: ReminderRepository,
  subRepo: SubscriptionRepository,
  userRepo: UserRepository,
): ReminderService {
  return {
    async processDay(date: string): Promise<void> {
      const entries = await reminderRepo.listEntries(date);
      log("info", "Processing reminders for date", {
        date,
        count: entries.length,
      });

      for (const entry of entries) {
        try {
          // 1. Load subscription and verify it still exists and date matches
          const stored = await subRepo.get(entry.userKey, entry.subscriptionId);
          if (!stored) {
            log("info", "Skipping stale reminder: subscription missing", {
              date,
              subId: entry.subscriptionId,
            });
            continue;
          }
          if (stored.nextBillingDate !== date) {
            log("info", "Skipping stale reminder: billing date mismatch", {
              date,
              subId: entry.subscriptionId,
            });
            continue;
          }

          // 2. Decrypt subscription payload using master encryption key
          const encryptedSub = parseEncryptedPayload(stored.encryptedPayload);
          const decryptedSub = await decrypt(encryptedSub, env.ENCRYPTION_KEY);
          const sub: Subscription = JSON.parse(decryptedSub);

          // 3. Load user profile and decrypt chatId
          const userProfile = await userRepo.getUserProfile(
            entry.userKey,
            env.ENCRYPTION_KEY,
          );
          if (!userProfile) {
            log("warn", "Skipping reminder: no user profile", {
              date,
              subId: entry.subscriptionId,
            });
            continue;
          }

          // 4. Skip if already sent
          const alreadySent = await reminderRepo.hasSent(
            entry.userKey,
            entry.subscriptionId,
            date,
          );
          if (alreadySent) {
            log("info", "Skipping reminder: already sent", {
              date,
              subId: entry.subscriptionId,
            });
            continue;
          }

          // 5. Send Telegram message
          const message = formatReminderMessage(sub);
          const result = await sendMessage(env, userProfile.chatId, message);

          if (!result.ok) {
            log("warn", "Failed to send reminder", {
              date,
              subId: entry.subscriptionId,
              status: result.status,
              description: result.description,
            });
            continue;
          }

          // 6. Mark sent only after successful delivery
          await reminderRepo.markSent(
            entry.userKey,
            entry.subscriptionId,
            date,
          );

          log("info", "Reminder sent successfully", {
            date,
            subId: entry.subscriptionId,
          });
        } catch (error) {
          log("error", "Error processing reminder entry", {
            date,
            subId: entry.subscriptionId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    },
  };
}

/**
 * Compute the date range for scheduled reminders.
 * Returns dates from today through today + daysAhead (inclusive).
 */
export function getReminderDateRange(daysAhead: number): string[] {
  const today = new Date();
  const dates: string[] = [];
  for (let i = 0; i <= daysAhead; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() + i);
    dates.push(formatDate(d));
  }
  return dates;
}

export { getReminderDaysAhead };
