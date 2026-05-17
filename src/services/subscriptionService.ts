import { SubscriptionRepository } from "../repositories/subscriptionRepository.js";
import { Subscription, StoredSubscription } from "../models/subscription.js";
import { encrypt, decrypt, serializeEncryptedPayload, parseEncryptedPayload } from "../crypto/encryption.js";
import { shortId } from "../utils/shortId.js";

export type ResolveResult =
  | { kind: "found"; id: string }
  | { kind: "ambiguous"; matches: string[] }
  | { kind: "not_found" };

export interface SubscriptionService {
  create(userKey: string, sub: Subscription, encryptionKey: string): Promise<void>;
  list(userKey: string, encryptionKey: string): Promise<Subscription[]>;
  get(userKey: string, subId: string, encryptionKey: string): Promise<Subscription | null>;
  update(userKey: string, sub: Subscription, encryptionKey: string): Promise<void>;
  remove(userKey: string, subId: string): Promise<void>;
  removeAll(userKey: string): Promise<void>;
  resolveId(userKey: string, inputId: string, encryptionKey: string): Promise<ResolveResult>;
}

export function createSubscriptionService(
  repo: SubscriptionRepository
): SubscriptionService {
  return {
    async create(userKey: string, sub: Subscription, encryptionKey: string): Promise<void> {
      const payload = JSON.stringify(sub);
      const encrypted = await encrypt(payload, encryptionKey);
      const stored: StoredSubscription = {
        id: sub.id,
        encryptedPayload: serializeEncryptedPayload(encrypted),
        nextBillingDate: sub.nextBillingDate,
        billingCycle: sub.billingCycle,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt,
      };
      await repo.save(userKey, stored);
    },

    async list(userKey: string, encryptionKey: string): Promise<Subscription[]> {
      const ids = await repo.listIds(userKey);
      const subs: Subscription[] = [];
      for (const id of ids) {
        const stored = await repo.get(userKey, id);
        if (!stored) continue;
        const encrypted = parseEncryptedPayload(stored.encryptedPayload);
        const decrypted = await decrypt(encrypted, encryptionKey);
        subs.push(JSON.parse(decrypted));
      }
      return subs;
    },

    async get(userKey: string, subId: string, encryptionKey: string): Promise<Subscription | null> {
      const stored = await repo.get(userKey, subId);
      if (!stored) return null;
      const encrypted = parseEncryptedPayload(stored.encryptedPayload);
      const decrypted = await decrypt(encrypted, encryptionKey);
      return JSON.parse(decrypted);
    },

    async update(userKey: string, sub: Subscription, encryptionKey: string): Promise<void> {
      const payload = JSON.stringify(sub);
      const encrypted = await encrypt(payload, encryptionKey);
      const stored: StoredSubscription = {
        id: sub.id,
        encryptedPayload: serializeEncryptedPayload(encrypted),
        nextBillingDate: sub.nextBillingDate,
        billingCycle: sub.billingCycle,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt,
      };
      await repo.save(userKey, stored);
    },

    async remove(userKey: string, subId: string): Promise<void> {
      await repo.delete(userKey, subId);
    },

    async removeAll(userKey: string): Promise<void> {
      await repo.deleteAll(userKey);
    },

    async resolveId(userKey: string, inputId: string, encryptionKey: string): Promise<ResolveResult> {
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
        return { kind: "ambiguous", matches: matches.map((s) => shortId(s.id)) };
      }

      // Also try prefix match on full ID (user typed partial UUID)
      const prefixMatches = allSubs.filter((s) => s.id.startsWith(inputId));
      if (prefixMatches.length === 1) {
        return { kind: "found", id: prefixMatches[0].id };
      }
      if (prefixMatches.length > 1) {
        return { kind: "ambiguous", matches: prefixMatches.map((s) => shortId(s.id)) };
      }

      return { kind: "not_found" };
    },
  };
}
