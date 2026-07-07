import { KVNamespace } from "@cloudflare/workers-types";
import { StoredUserProfile, DecryptedUserProfile } from "../models/user.js";
import { UserSettings, DEFAULT_USER_SETTINGS } from "../models/userSettings.js";
import { userDeleted, userProfile } from "../utils/kvKeys.js";
import {
  encrypt,
  decrypt,
  serializeEncryptedPayload,
  parseEncryptedPayload,
} from "../crypto/encryption.js";
import { deriveUserKey } from "../crypto/keyDerivation.js";

export interface UserRepository {
  upsertUserProfile(
    userKey: string,
    chatId: number | string,
    encryptionKey: string,
  ): Promise<void>;
  getUserProfile(
    userKey: string,
    encryptionKey: string,
  ): Promise<DecryptedUserProfile | null>;
  getUserSettings(
    userKey: string,
    encryptionKey: string,
  ): Promise<UserSettings>;
  updateUserSettings(
    userKey: string,
    settings: UserSettings,
    encryptionKey: string,
  ): Promise<void>;
  deleteUserProfile(userKey: string): Promise<void>;
  markUserDeleted(userKey: string): Promise<void>;
  isUserDeleted(userKey: string): Promise<boolean>;
  clearUserDeleted(userKey: string): Promise<void>;
}

export const USER_DELETION_TOMBSTONE_TTL_SECONDS = 180 * 24 * 60 * 60;

export function createUserRepository(kv: KVNamespace): UserRepository {
  async function readProfile(
    userKey: string,
    encryptionKey: string,
  ): Promise<DecryptedUserProfile | null> {
    const key = userProfile(userKey);
    const data = await kv.get(key);
    if (!data) return null;

    const stored: StoredUserProfile = JSON.parse(data);
    const encrypted = parseEncryptedPayload(stored.encryptedPayload);
    const derivedKey = await deriveUserKey(encryptionKey, userKey);
    const decrypted = await decrypt(encrypted, derivedKey);
    return JSON.parse(decrypted) as DecryptedUserProfile;
  }

  async function writeProfile(
    userKey: string,
    profile: DecryptedUserProfile,
    encryptionKey: string,
    firstSeenAt: string,
  ): Promise<void> {
    const key = userProfile(userKey);
    const now = new Date().toISOString();

    const derivedKey = await deriveUserKey(encryptionKey, userKey);
    const encrypted = await encrypt(JSON.stringify(profile), derivedKey);
    const stored: StoredUserProfile = {
      encryptedPayload: serializeEncryptedPayload(encrypted),
      createdAt: firstSeenAt,
      updatedAt: now,
    };

    await kv.put(key, JSON.stringify(stored));
  }

  return {
    async upsertUserProfile(
      userKey: string,
      chatId: number | string,
      encryptionKey: string,
    ): Promise<void> {
      const key = userProfile(userKey);
      const existingData = await kv.get(key);

      const now = new Date().toISOString();
      let firstSeenAt = now;
      let existingSettings: UserSettings | undefined;

      if (existingData) {
        const stored: StoredUserProfile = JSON.parse(existingData);
        const encrypted = parseEncryptedPayload(stored.encryptedPayload);
        const derivedKey = await deriveUserKey(encryptionKey, userKey);
        const decrypted = await decrypt(encrypted, derivedKey);
        const parsed = JSON.parse(decrypted) as DecryptedUserProfile;
        firstSeenAt = parsed.firstSeenAt;
        existingSettings = parsed.settings;
      }

      const payload: DecryptedUserProfile = {
        chatId,
        firstSeenAt,
        lastSeenAt: now,
        settings: existingSettings,
      };

      const derivedKey = await deriveUserKey(encryptionKey, userKey);
      const encrypted = await encrypt(JSON.stringify(payload), derivedKey);
      const stored: StoredUserProfile = {
        encryptedPayload: serializeEncryptedPayload(encrypted),
        createdAt: firstSeenAt,
        updatedAt: now,
      };

      await kv.put(key, JSON.stringify(stored));
    },

    async getUserProfile(
      userKey: string,
      encryptionKey: string,
    ): Promise<DecryptedUserProfile | null> {
      return readProfile(userKey, encryptionKey);
    },

    async getUserSettings(
      userKey: string,
      encryptionKey: string,
    ): Promise<UserSettings> {
      const profile = await readProfile(userKey, encryptionKey);
      if (!profile) {
        return DEFAULT_USER_SETTINGS;
      }
      return profile.settings ?? DEFAULT_USER_SETTINGS;
    },

    async updateUserSettings(
      userKey: string,
      settings: UserSettings,
      encryptionKey: string,
    ): Promise<void> {
      const existing = await readProfile(userKey, encryptionKey);
      if (!existing) {
        const now = new Date().toISOString();
        const profile: DecryptedUserProfile = {
          chatId: "",
          firstSeenAt: now,
          lastSeenAt: now,
          settings,
        };
        await writeProfile(userKey, profile, encryptionKey, now);
        return;
      }

      const updated: DecryptedUserProfile = {
        ...existing,
        settings,
        lastSeenAt: new Date().toISOString(),
      };
      await writeProfile(userKey, updated, encryptionKey, existing.firstSeenAt);
    },

    async deleteUserProfile(userKey: string): Promise<void> {
      const key = userProfile(userKey);
      await kv.delete(key);
    },

    async markUserDeleted(userKey: string): Promise<void> {
      await kv.put(userDeleted(userKey), new Date().toISOString(), {
        expirationTtl: USER_DELETION_TOMBSTONE_TTL_SECONDS,
      });
    },

    async isUserDeleted(userKey: string): Promise<boolean> {
      return (await kv.get(userDeleted(userKey))) !== null;
    },

    async clearUserDeleted(userKey: string): Promise<void> {
      await kv.delete(userDeleted(userKey));
    },
  };
}
