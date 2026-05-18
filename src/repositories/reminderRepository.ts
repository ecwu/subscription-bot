import { KVNamespace } from "@cloudflare/workers-types";
import { reminderDate, reminderSent } from "../utils/kvKeys.js";

export interface ReminderEntry {
  userKey: string;
  subscriptionId: string;
}

export interface ReminderRepository {
  addEntry(
    date: string,
    userKey: string,
    subscriptionId: string,
  ): Promise<void>;
  removeEntry(
    date: string,
    userKey: string,
    subscriptionId: string,
  ): Promise<void>;
  listEntries(date: string): Promise<ReminderEntry[]>;
  listDatesThrough(maxDate: string): Promise<string[]>;
  hasSent(
    userKey: string,
    subscriptionId: string,
    billingDate: string,
  ): Promise<boolean>;
  markSent(
    userKey: string,
    subscriptionId: string,
    billingDate: string,
  ): Promise<void>;
}

export function createReminderRepository(kv: KVNamespace): ReminderRepository {
  return {
    async addEntry(
      date: string,
      userKey: string,
      subscriptionId: string,
    ): Promise<void> {
      const key = reminderDate(date);
      const existing = await kv.get(key);
      const entries: ReminderEntry[] = existing ? JSON.parse(existing) : [];

      // Deduplicate
      const alreadyExists = entries.some(
        (e) => e.userKey === userKey && e.subscriptionId === subscriptionId,
      );
      if (alreadyExists) return;

      entries.push({ userKey, subscriptionId });
      await kv.put(key, JSON.stringify(entries));
    },

    async removeEntry(
      date: string,
      userKey: string,
      subscriptionId: string,
    ): Promise<void> {
      const key = reminderDate(date);
      const existing = await kv.get(key);
      if (!existing) return;

      const entries: ReminderEntry[] = JSON.parse(existing);
      const filtered = entries.filter(
        (e) => !(e.userKey === userKey && e.subscriptionId === subscriptionId),
      );

      if (filtered.length === entries.length) return;
      await kv.put(key, JSON.stringify(filtered));
    },

    async listEntries(date: string): Promise<ReminderEntry[]> {
      const key = reminderDate(date);
      const data = await kv.get(key);
      return data ? JSON.parse(data) : [];
    },

    async listDatesThrough(maxDate: string): Promise<string[]> {
      const prefix = reminderDate("");
      const dates: string[] = [];
      let cursor: string | undefined;

      do {
        const list = await kv.list({ prefix, cursor });
        for (const key of list.keys) {
          const date = key.name.slice(prefix.length);
          if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date <= maxDate) {
            dates.push(date);
          }
        }
        cursor = list.list_complete ? undefined : list.cursor;
      } while (cursor);

      return Array.from(new Set(dates)).sort();
    },

    async hasSent(
      userKey: string,
      subscriptionId: string,
      billingDate: string,
    ): Promise<boolean> {
      const key = reminderSent(userKey, subscriptionId, billingDate);
      const data = await kv.get(key);
      return data !== null;
    },

    async markSent(
      userKey: string,
      subscriptionId: string,
      billingDate: string,
    ): Promise<void> {
      const key = reminderSent(userKey, subscriptionId, billingDate);
      await kv.put(key, "1");
    },
  };
}

/**
 * NOTE: This repository stores all reminders for a single date in one KV value.
 * Cloudflare KV values have a size limit (currently 25 MiB).
 * At scale, this design may need to be sharded (e.g., by user prefix or hour)
 * to avoid exceeding the limit.
 *
 * WARNING: KV does not support atomic multi-key transactions.
 * Concurrent addEntry/removeEntry calls for the same date may race and
 * overwrite each other. The design is best-effort only.
 */
