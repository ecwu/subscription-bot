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
}

export function createSubscriptionRepository(
  kv: KVNamespace,
): SubscriptionRepository {
  return {
    async save(userKey: string, sub: StoredSubscription): Promise<void> {
      await kv.put(subscription(userKey, sub.id), JSON.stringify(sub));
    },

    async get(
      userKey: string,
      subId: string,
    ): Promise<StoredSubscription | null> {
      const key = subscription(userKey, subId);
      const data = await kv.get(key);
      return data ? JSON.parse(data) : null;
    },

    async listIds(userKey: string): Promise<string[]> {
      const prefix = subscription(userKey, "");
      const ids: string[] = [];
      let cursor: string | undefined;

      do {
        const list = await kv.list({ prefix, cursor });
        for (const key of list.keys) {
          const id = key.name.slice(prefix.length);
          if (id) ids.push(id);
        }
        cursor = list.list_complete ? undefined : list.cursor;
      } while (cursor);

      return ids;
    },

    async delete(userKey: string, subId: string): Promise<void> {
      await kv.delete(subscription(userKey, subId));
    },

    async deleteAll(userKey: string): Promise<void> {
      const indexKey = userSubscriptionsIndex(userKey);
      const ids = await this.listIds(userKey);

      for (const subId of ids) {
        await kv.delete(subscription(userKey, subId));
      }

      // Remove the legacy index so deployments using the old representation do
      // not retain stale metadata after a full account deletion.
      await kv.delete(indexKey);
      await kv.delete(userProfile(userKey));
    },
  };
}
