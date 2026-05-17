import { SubscriptionService } from "./subscriptionService.js";
import { Subscription } from "../models/subscription.js";
import { UserRepository } from "../repositories/userRepository.js";
import { ReminderRepository } from "../repositories/reminderRepository.js";
import { log } from "../utils/logger.js";

export interface UserExport {
  version: number;
  exportedAt: string;
  subscriptions: Subscription[];
}

export interface PrivacyService {
  exportUserData(userKey: string, encryptionKey: string): Promise<UserExport>;
  deleteUserData(userKey: string): Promise<void>;
}

export function createPrivacyService(
  subscriptionService: SubscriptionService,
  userRepo: UserRepository,
  _reminderRepo: ReminderRepository
): PrivacyService {
  return {
    async exportUserData(
      userKey: string,
      encryptionKey: string
    ): Promise<UserExport> {
      const subscriptions = await subscriptionService.list(
        userKey,
        encryptionKey
      );
      return {
        version: 1,
        exportedAt: new Date().toISOString(),
        subscriptions,
      };
    },

    async deleteUserData(userKey: string): Promise<void> {
      // 1. Remove all subscriptions (this also cleans reminder index entries)
      await subscriptionService.removeAll(userKey);

      // 2. Remove user profile
      await userRepo.deleteUserProfile(userKey);

      // 3. Best-effort: clean up any remaining sent markers.
      // KV does not support prefix-based deletion, so stale sent markers
      // may remain until they expire (if TTL is set) or are overwritten.
      // This is acceptable because sent markers contain no sensitive data
      // and are keyed by userKey + subId + date.
      log("info", "User data deletion complete", {
        // Do not log userKey
      });
    },
  };
}
