import { UserSettings, DEFAULT_USER_SETTINGS } from "./userSettings.js";

export interface StoredUserProfile {
  userKey?: string;
  encryptedPayload: string;
  createdAt: string;
  updatedAt: string;
}

export interface DecryptedUserProfile {
  chatId: number | string;
  firstSeenAt: string;
  lastSeenAt: string;
  settings?: UserSettings;
}

export function resolveUserSettings(
  profile: DecryptedUserProfile,
): UserSettings {
  return profile.settings ?? DEFAULT_USER_SETTINGS;
}
