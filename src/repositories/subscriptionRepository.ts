import { KVNamespace } from "@cloudflare/workers-types";
import { StoredSubscription } from "../models/subscription.js";
import {
  subscription,
  userSubscriptionsIndex,
  userProfile,
} from "../utils/kvKeys.js";

export interface SubscriptionRepository {
  save(userKey: string, sub: StoredSubscription): Promise<void>;
  get(userKey: string, subId: string): Promise<StoredSubscription | null>;
  listIds(userKey: string): Promise<string[]>;
  delete(userKey: string, subId: string): Promise<void>;
  deleteAll(userKey: string): Promise<void>;
  rebuildIndex(userKey: string): Promise<void>;
  cleanupOrphanedEntries(userKey: string): Promise<void>;
}

export function createSubscriptionRepository(
  kv: KVNamespace
): SubscriptionRepository {
  return {
    async save(userKey: string, sub: StoredSubscription): Promise<void> {
      const key = subscription(userKey, sub.id);
      const indexKey = userSubscriptionsIndex(userKey);

      // WARNING: KV does not support multi-key transactions.
      // If the index update fails after the subscription is stored,
      // the record becomes orphaned (reachable only by direct key).
      // Use rebuildIndex() or cleanupOrphanedEntries() to repair.
      await kv.put(key, JSON.stringify(sub));

      const existing = await kv.get(indexKey);
      const ids: string[] = existing ? JSON.parse(existing) : [];
      if (!ids.includes(sub.id)) {
        ids.push(sub.id);
        await kv.put(indexKey, JSON.stringify(ids));
      }
    },

    async get(
      userKey: string,
      subId: string
    ): Promise<StoredSubscription | null> {
      const key = subscription(userKey, subId);
      const data = await kv.get(key);
      return data ? JSON.parse(data) : null;
    },

    async listIds(userKey: string): Promise<string[]> {
      const indexKey = userSubscriptionsIndex(userKey);
      const data = await kv.get(indexKey);
      return data ? JSON.parse(data) : [];
    },

    async delete(userKey: string, subId: string): Promise<void> {
      const key = subscription(userKey, subId);
      const indexKey = userSubscriptionsIndex(userKey);

      // WARNING: Non-atomic. If the index update fails after deletion,
      // the index will contain a stale entry until cleanupOrphanedEntries() runs.
      await kv.delete(key);

      const existing = await kv.get(indexKey);
      const ids: string[] = existing ? JSON.parse(existing) : [];
      const filtered = ids.filter((id) => id !== subId);
      await kv.put(indexKey, JSON.stringify(filtered));
    },

    async deleteAll(userKey: string): Promise<void> {
      const indexKey = userSubscriptionsIndex(userKey);
      const ids = await this.listIds(userKey);

      // Delete each subscription record.
      // Non-atomic: if an isolate is evicted mid-loop, some records may remain.
      // A subsequent /delete_me or cleanup would need to handle orphans.
      for (const subId of ids) {
        const key = subscription(userKey, subId);
        await kv.delete(key);
      }

      // Delete the index itself and any profile key.
      await kv.delete(indexKey);
      await kv.delete(userProfile(userKey));
    },

    /**
     * Rebuild the subscription index by listing all known subscription keys.
     * This is a best-effort repair for index inconsistency.
     */
    async rebuildIndex(userKey: string): Promise<void> {
      const indexKey = userSubscriptionsIndex(userKey);
      const prefix = subscription(userKey, "");
      const list = await kv.list({ prefix });
      const ids: string[] = [];

      for (const key of list.keys) {
        // key.name is like "user:<userKey>:sub:<subId>"
        const parts = key.name.split(":");
        const subId = parts[parts.length - 1];
        if (subId) ids.push(subId);
      }

      await kv.put(indexKey, JSON.stringify(ids));
    },

    /**
     * Remove index entries that no longer have a corresponding subscription record.
     */
    async cleanupOrphanedEntries(userKey: string): Promise<void> {
      const ids = await this.listIds(userKey);
      const indexKey = userSubscriptionsIndex(userKey);
      const validIds: string[] = [];

      for (const id of ids) {
        const exists = await this.get(userKey, id);
        if (exists) {
          validIds.push(id);
        }
      }

      if (validIds.length !== ids.length) {
        await kv.put(indexKey, JSON.stringify(validIds));
      }
    },
  };
}
