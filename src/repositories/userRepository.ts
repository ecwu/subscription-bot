import { KVNamespace } from "@cloudflare/workers-types";
import { StoredUserProfile, DecryptedUserProfile } from "../models/user.js";
import { userProfile } from "../utils/kvKeys.js";
import {
  encrypt,
  decrypt,
  serializeEncryptedPayload,
  parseEncryptedPayload,
} from "../crypto/encryption.js";

export interface UserRepository {
  upsertUserProfile(
    userKey: string,
    chatId: number | string,
    encryptionKey: string
  ): Promise<void>;
  getUserProfile(
    userKey: string,
    encryptionKey: string
  ): Promise<DecryptedUserProfile | null>;
  deleteUserProfile(userKey: string): Promise<void>;
}

export function createUserRepository(kv: KVNamespace): UserRepository {
  return {
    async upsertUserProfile(
      userKey: string,
      chatId: number | string,
      encryptionKey: string
    ): Promise<void> {
      const key = userProfile(userKey);
      const existingData = await kv.get(key);

      const now = new Date().toISOString();
      let firstSeenAt = now;

      if (existingData) {
        const stored: StoredUserProfile = JSON.parse(existingData);
        const encrypted = parseEncryptedPayload(stored.encryptedPayload);
        const decrypted = await decrypt(encrypted, encryptionKey);
        const parsed = JSON.parse(decrypted) as DecryptedUserProfile;
        firstSeenAt = parsed.firstSeenAt;
      }

      const payload: DecryptedUserProfile = {
        chatId,
        firstSeenAt,
        lastSeenAt: now,
      };

      const encrypted = await encrypt(JSON.stringify(payload), encryptionKey);
      const stored: StoredUserProfile = {
        userKey,
        encryptedPayload: serializeEncryptedPayload(encrypted),
        createdAt: firstSeenAt,
        updatedAt: now,
      };

      await kv.put(key, JSON.stringify(stored));
    },

    async getUserProfile(
      userKey: string,
      encryptionKey: string
    ): Promise<DecryptedUserProfile | null> {
      const key = userProfile(userKey);
      const data = await kv.get(key);
      if (!data) return null;

      const stored: StoredUserProfile = JSON.parse(data);
      const encrypted = parseEncryptedPayload(stored.encryptedPayload);
      const decrypted = await decrypt(encrypted, encryptionKey);
      return JSON.parse(decrypted) as DecryptedUserProfile;
    },

    async deleteUserProfile(userKey: string): Promise<void> {
      const key = userProfile(userKey);
      await kv.delete(key);
    },
  };
}
