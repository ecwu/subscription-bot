import { SubscriptionService } from "./subscriptionService.js";

export interface ExportService {
  exportUserData(userKey: string, encryptionKey: string): Promise<unknown>;
}

export function createExportService(
  subscriptionService: SubscriptionService
): ExportService {
  return {
    async exportUserData(
      userKey: string,
      encryptionKey: string
    ): Promise<unknown> {
      const subscriptions = await subscriptionService.list(
        userKey,
        encryptionKey
      );
      return {
        version: "1.0.0",
        exportedAt: new Date().toISOString(),
        subscriptions,
      };
    },
  };
}
