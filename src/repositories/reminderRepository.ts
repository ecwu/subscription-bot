import { KVNamespace } from "@cloudflare/workers-types";
import { Reminder } from "../models/reminder.js";
import { reminderDate } from "../utils/kvKeys.js";

export interface ReminderRepository {
  save(reminder: Reminder): Promise<void>;
  listByDate(date: string): Promise<Reminder[]>;
  markSent(reminderId: string, date: string, sentAt: string): Promise<void>;
  delete(reminderId: string, date: string): Promise<void>;
}

export function createReminderRepository(kv: KVNamespace): ReminderRepository {
  return {
    async save(reminder: Reminder): Promise<void> {
      const key = reminderDate(reminder.remindAt);
      const existing = await kv.get(key);
      const reminders: Reminder[] = existing ? JSON.parse(existing) : [];
      reminders.push(reminder);
      await kv.put(key, JSON.stringify(reminders));
    },

    async listByDate(date: string): Promise<Reminder[]> {
      const key = reminderDate(date);
      const data = await kv.get(key);
      return data ? JSON.parse(data) : [];
    },

    async markSent(
      reminderId: string,
      date: string,
      sentAt: string
    ): Promise<void> {
      const key = reminderDate(date);
      const data = await kv.get(key);
      if (!data) return;

      const reminders: Reminder[] = JSON.parse(data);
      const updated = reminders.map((r) =>
        r.id === reminderId ? { ...r, sentAt } : r
      );
      await kv.put(key, JSON.stringify(updated));
    },

    async delete(reminderId: string, date: string): Promise<void> {
      const key = reminderDate(date);
      const data = await kv.get(key);
      if (!data) return;

      const reminders: Reminder[] = JSON.parse(data);
      const filtered = reminders.filter((r) => r.id !== reminderId);
      await kv.put(key, JSON.stringify(filtered));
    },
  };
}

/**
 * NOTE: This repository stores all reminders for a single date in one KV value.
 * Cloudflare KV values have a size limit (currently 25 MiB).
 * At scale, this design may need to be sharded (e.g., by user prefix or hour)
 * to avoid exceeding the limit.
 */
