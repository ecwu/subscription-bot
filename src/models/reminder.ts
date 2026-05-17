export interface Reminder {
  id: string;
  userKey: string;
  subscriptionId: string;
  remindAt: string; // ISO 8601 date
  sentAt?: string;
}
