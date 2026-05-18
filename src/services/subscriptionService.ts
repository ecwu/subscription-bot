import { SubscriptionRepository } from "../repositories/subscriptionRepository.js";
import { ReminderRepository } from "../repositories/reminderRepository.js";
import { Subscription, StoredSubscription } from "../models/subscription.js";
import {
  encrypt,
  decrypt,
  serializeEncryptedPayload,
  parseEncryptedPayload,
} from "../crypto/encryption.js";
import { shortId } from "../utils/shortId.js";
import { getBillingAnchorDay, getNextBillingDate } from "../utils/date.js";

export type ResolveResult =
  | { kind: "found"; id: string }
  | { kind: "ambiguous"; matches: string[] }
  | { kind: "not_found" };

export interface SubscriptionService {
  create(
    userKey: string,
    sub: Subscription,
    encryptionKey: string,
  ): Promise<void>;
  list(userKey: string, encryptionKey: string): Promise<Subscription[]>;
  get(
    userKey: string,
    subId: string,
    encryptionKey: string,
  ): Promise<Subscription | null>;
  update(
    userKey: string,
    sub: Subscription,
    encryptionKey: string,
  ): Promise<void>;
  advancePastDue(
    userKey: string,
    subId: string,
    encryptionKey: string,
    today: string,
  ): Promise<Subscription | null>;
  remove(userKey: string, subId: string): Promise<void>;
  removeAll(userKey: string): Promise<void>;
  resolveId(
    userKey: string,
    inputId: string,
    encryptionKey: string,
  ): Promise<ResolveResult>;
}

export function createSubscriptionService(
  repo: SubscriptionRepository,
  reminderRepo: ReminderRepository,
): SubscriptionService {
  function withBillingAnchorDay(sub: Subscription): Subscription {
    return {
      ...sub,
      billingAnchorDay:
        sub.billingAnchorDay ?? getBillingAnchorDay(sub.nextBillingDate),
    };
  }

  async function decryptStored(
    stored: StoredSubscription,
    encryptionKey: string,
  ): Promise<Subscription> {
    const encrypted = parseEncryptedPayload(stored.encryptedPayload);
    const decrypted = await decrypt(encrypted, encryptionKey);
    return withBillingAnchorDay(JSON.parse(decrypted));
  }

  return {
    async create(
      userKey: string,
      sub: Subscription,
      encryptionKey: string,
    ): Promise<void> {
      const billingAnchorDay =
        sub.billingAnchorDay ?? getBillingAnchorDay(sub.nextBillingDate);
      const normalizedSub = { ...sub, billingAnchorDay };
      const normalizedPayload = JSON.stringify(normalizedSub);
      const encrypted = await encrypt(normalizedPayload, encryptionKey);
      const stored: StoredSubscription = {
        id: sub.id,
        encryptedPayload: serializeEncryptedPayload(encrypted),
        nextBillingDate: sub.nextBillingDate,
        billingCycle: sub.billingCycle,
        billingAnchorDay,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt,
      };
      await repo.save(userKey, stored);
      await reminderRepo.addEntry(sub.nextBillingDate, userKey, sub.id);
    },

    async list(
      userKey: string,
      encryptionKey: string,
    ): Promise<Subscription[]> {
      const ids = await repo.listIds(userKey);
      const subs: Subscription[] = [];
      for (const id of ids) {
        const stored = await repo.get(userKey, id);
        if (!stored) continue;
        subs.push(await decryptStored(stored, encryptionKey));
      }
      return subs;
    },

    async get(
      userKey: string,
      subId: string,
      encryptionKey: string,
    ): Promise<Subscription | null> {
      const stored = await repo.get(userKey, subId);
      if (!stored) return null;
      return decryptStored(stored, encryptionKey);
    },

    async update(
      userKey: string,
      sub: Subscription,
      encryptionKey: string,
    ): Promise<void> {
      // Load the old stored version to know the previous nextBillingDate
      const oldStored = await repo.get(userKey, sub.id);

      const billingAnchorDay =
        sub.billingAnchorDay ?? getBillingAnchorDay(sub.nextBillingDate);
      const normalizedSub = { ...sub, billingAnchorDay };
      const payload = JSON.stringify(normalizedSub);
      const encrypted = await encrypt(payload, encryptionKey);
      const stored: StoredSubscription = {
        id: sub.id,
        encryptedPayload: serializeEncryptedPayload(encrypted),
        nextBillingDate: sub.nextBillingDate,
        billingCycle: sub.billingCycle,
        billingAnchorDay,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt,
      };
      await repo.save(userKey, stored);

      // Best-effort: update reminder index when billing date changes
      if (oldStored && oldStored.nextBillingDate !== sub.nextBillingDate) {
        await reminderRepo.removeEntry(
          oldStored.nextBillingDate,
          userKey,
          sub.id,
        );
        await reminderRepo.addEntry(sub.nextBillingDate, userKey, sub.id);
      }
    },

    async advancePastDue(
      userKey: string,
      subId: string,
      encryptionKey: string,
      today: string,
    ): Promise<Subscription | null> {
      const sub = await this.get(userKey, subId, encryptionKey);
      if (!sub) return null;
      if (sub.nextBillingDate > today) return sub;

      let nextBillingDate = sub.nextBillingDate;
      const billingAnchorDay =
        sub.billingAnchorDay ?? getBillingAnchorDay(sub.nextBillingDate);

      while (nextBillingDate <= today) {
        const next = getNextBillingDate(
          nextBillingDate,
          sub.billingCycle,
          billingAnchorDay,
        );
        if (!next) return sub;
        nextBillingDate = next;
      }

      const updated: Subscription = {
        ...sub,
        nextBillingDate,
        billingAnchorDay,
        updatedAt: new Date().toISOString(),
      };
      await this.update(userKey, updated, encryptionKey);
      return updated;
    },

    async remove(userKey: string, subId: string): Promise<void> {
      const stored = await repo.get(userKey, subId);
      if (stored) {
        await reminderRepo.removeEntry(stored.nextBillingDate, userKey, subId);
      }
      await repo.delete(userKey, subId);
    },

    async removeAll(userKey: string): Promise<void> {
      const ids = await repo.listIds(userKey);
      for (const subId of ids) {
        const stored = await repo.get(userKey, subId);
        if (stored) {
          await reminderRepo.removeEntry(
            stored.nextBillingDate,
            userKey,
            subId,
          );
        }
      }
      await repo.deleteAll(userKey);
    },

    async resolveId(
      userKey: string,
      inputId: string,
      encryptionKey: string,
    ): Promise<ResolveResult> {
      const allSubs = await this.list(userKey, encryptionKey);

      // Exact match wins
      const exact = allSubs.find((s) => s.id === inputId);
      if (exact) {
        return { kind: "found", id: exact.id };
      }

      // Prefix match on short ID
      const matches = allSubs.filter((s) => shortId(s.id) === inputId);
      if (matches.length === 1) {
        return { kind: "found", id: matches[0].id };
      }
      if (matches.length > 1) {
        return {
          kind: "ambiguous",
          matches: matches.map((s) => shortId(s.id)),
        };
      }

      // Also try prefix match on full ID (user typed partial UUID)
      const prefixMatches = allSubs.filter((s) => s.id.startsWith(inputId));
      if (prefixMatches.length === 1) {
        return { kind: "found", id: prefixMatches[0].id };
      }
      if (prefixMatches.length > 1) {
        return {
          kind: "ambiguous",
          matches: prefixMatches.map((s) => shortId(s.id)),
        };
      }

      return { kind: "not_found" };
    },
  };
}
