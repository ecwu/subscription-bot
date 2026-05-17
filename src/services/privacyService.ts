import { SubscriptionService } from "./subscriptionService.js";
import { Subscription } from "../models/subscription.js";

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
  subscriptionService: SubscriptionService
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
      await subscriptionService.removeAll(userKey);
    },
  };
}
